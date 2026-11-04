import { copyValue } from "../../../shared/runtime/values";
// Existing ES5 interpreter; only the game API crosses the sandbox boundary.
// Its untyped internal API is isolated in this adapter.
// @ts-ignore Generated upstream bundle; see scripts/bundle-interpreter.mjs.
import Interpreter from "../vendor/interpreter.js";
// SpacetimeDB deliberately forbids ambient randomness. Do not initialize
// libraries we never expose (including access to the Math.random getter).
Interpreter.prototype.initMath = function () {};
Interpreter.prototype.initDate = function () {};
// Implicit object coercion can expand nested arrays without interpreter steps.
// Keep it outside the supported surface, just like native library calls.
Interpreter.Object.prototype.toString = function () {
  throw Error("Object-to-primitive coercion is unavailable.");
};
Interpreter.Object.prototype.valueOf = function () {
  throw Error("Object-to-primitive coercion is unavailable.");
};

export type Scalar = string | number | boolean | null;
// Native values cross only this adapter; structured calls have separate bounded conversion.
export type ScriptApi = Record<string, (...args: any[]) => any>;
const forbidden = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "toString",
  "valueOf",
]);
function bounded(value: unknown) {
  if (typeof value === "string" && value.length > 4096)
    throw Error("Script string limit (4096) exceeded.");
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Script numbers must be finite.");
}
export function executeSandbox(
  source: string,
  handler: string,
  api: ScriptApi,
  eventArgs: unknown[] = [],
  codecs: { arguments?: string[]; results?: string[] } = {},
) {
  if (source.length > 16000)
    throw Error("Script source limit (16000) exceeded.");
  if (!/^on_[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(handler))
    throw Error("Invalid event handler.");
  const program =
    '"use strict";\n' +
    source +
    "\nif (typeof " +
    handler +
    ' === "function") ' +
    handler +
    "(ctx" +
    eventArgs.map((a) => "," + JSON.stringify(copyValue(a))).join("") +
    ");";
  const ast = Interpreter.prototype.parse_(program, "object");
  validateAst(ast);
  const vm = new Interpreter(ast);
  // Remove standard-library entry points, including native methods reachable
  // through literal prototypes. No eval, Function, Date, regex, async or I/O.
  const visited = new Set<any>();
  function seal(obj: any) {
    if (!obj || typeof obj !== "object" || visited.has(obj)) return;
    visited.add(obj);
    if (
      obj.nativeFunc ||
      obj.asyncFunc ||
      obj.eval ||
      (obj.node && !obj.node.end)
    ) {
      obj.nativeFunc = () => {
        throw Error("Only game API native functions are available.");
      };
      delete obj.asyncFunc;
      delete obj.eval;
      delete obj.node;
    }
    seal(obj.proto);
    for (const key of Object.getOwnPropertyNames(obj.properties ?? {}))
      seal(obj.properties[key]);
  }
  seal(vm.globalObject);
  for (const key of Object.keys(vm.globalObject.properties)) {
    if (
      !["undefined", "NaN", "Infinity"].includes(key) &&
      !vm.globalObject.properties[key]?.node &&
      // Hoisted top-level var bindings are non-configurable. Their initializer
      // runs later under the same budgets; native entry points were sealed above.
      Object.getOwnPropertyDescriptor(vm.globalObject.properties, key)
        ?.configurable !== false
    )
      delete vm.globalObject.properties[key];
  }
  const context = vm.createObjectProto(null);
  let effects = 0;
  function structured(value: any, depth = 0, budget = { nodes: 0 }): any {
    if (++budget.nodes > 512 || depth > 8)
      throw Error("Structured API value budget exceeded.");
    if (value === null || typeof value !== "object") {
      bounded(value);
      return value;
    }
    if (
      value.class === "Function" ||
      value.nativeFunc ||
      value.node ||
      value.asyncFunc
    )
      throw Error("API values cannot contain functions.");
    const result: any = value.class === "Array" ? [] : Object.create(null);
    for (const key of Object.keys(value.properties ?? {})) {
      if (forbidden.has(key)) throw Error("Reserved API property.");
      if (key === "length" && Array.isArray(result)) continue;
      result[key] = structured(value.properties[key], depth + 1, budget);
    }
    return result;
  }
  for (const [name, fn] of Object.entries(api)) {
    const path = name.split(".");
    let parent = context;
    for (const part of path.slice(0, -1)) {
      if (!parent.properties[part])
        vm.setProperty(parent, part, vm.createObjectProto(null));
      parent = parent.properties[part];
    }
    vm.setProperty(
      parent,
      path[path.length - 1],
      vm.createNativeFunction((...args: unknown[]) => {
        if (++effects > 64) throw Error("Game API call limit (64) exceeded.");
        const acceptsStructured = codecs.arguments?.includes(name) ?? false;
        if (acceptsStructured) args = args.map((a) => copyValue(structured(a)));
        for (const value of args) {
          if (
            !acceptsStructured &&
            value !== null &&
            !["string", "number", "boolean", "undefined"].includes(typeof value)
          )
            throw Error("Game API arguments must be primitive values.");
          bounded(value);
        }
        const result = fn(...(args as Scalar[]));
        bounded(result);
        return codecs.results?.includes(name)
          ? vm.nativeToPseudo(copyValue(result))
          : result;
      }),
    );
  }
  vm.setProperty(vm.globalObject, "ctx", context, { writable: false });
  let allocations = 0,
    writes = 0,
    steps = 0;
  const create = vm.createObjectProto.bind(vm);
  vm.createObjectProto = (proto: unknown) => {
    if (++allocations > 1024)
      throw Error("Script object allocation limit exceeded.");
    return create(proto);
  };
  const set = vm.setProperty.bind(vm),
    get = vm.getProperty.bind(vm);
  vm.setProperty = (obj: any, name: any, value: any, descriptor: any) => {
    bounded(value);
    if (++writes > 10000 || forbidden.has(String(name)))
      throw Error("Script property limit or reserved property.");
    if (
      obj.class === "Array" &&
      ((String(name) === "length" && Number(value) > 256) ||
        (/^\d+$/.test(String(name)) && Number(name) >= 256))
    )
      throw Error("Script array limit (256) exceeded.");
    return set(obj, name, value, descriptor);
  };
  vm.getProperty = (obj: any, name: any) => {
    if (forbidden.has(String(name))) throw Error("Reserved property.");
    return get(obj, name);
  };
  const step = vm.step.bind(vm);
  vm.step = () => {
    if (++steps > 20000 || vm.stateStack.length > 128)
      throw Error("Script execution budget exceeded.");
    for (const state of vm.stateStack) bounded(state.value);
    return step();
  };
  while (vm.step()) {
    /* bounded interpreter execution */
  }
  return { steps, calls: effects, allocations };
}

function validateAst(ast: any) {
  let nodes = 0;
  function inspect(node: any, depth = 0) {
    if (!node || typeof node !== "object") return;
    if (++nodes > 6000 || depth > 80)
      throw Error("Script syntax complexity limit exceeded.");
    if (
      (node.type === "Literal" &&
        node.value !== null &&
        typeof node.value === "object") ||
      node.regex ||
      node.type === "NewExpression" ||
      node.type === "WithStatement" ||
      (node.type === "Property" && node.kind !== "init")
    )
      throw Error(
        "Constructors, regular expressions, getters and setters are unavailable.",
      );
    if (node.type === "Literal") bounded(node.value);
    if (node.type === "Identifier" && forbidden.has(node.name))
      throw Error("Reserved property: " + node.name);
    for (const key of Object.keys(node))
      if (!["loc", "start", "end"].includes(key)) inspect(node[key], depth + 1);
  }
  inspect(ast);
}
export function validateSource(source: string, handlers: string[]) {
  if (typeof source !== "string" || source.length > 16000)
    throw Error("Source budget exceeded.");
  const ast = Interpreter.prototype.parse_(
    '"use strict";\n' + source,
    "package",
  );
  validateAst(ast);
  const declared = new Set(
    ast.body
      .filter((n: any) => n.type === "FunctionDeclaration")
      .map((n: any) => n.id.name),
  );
  for (const handler of handlers)
    if (!declared.has(handler))
      throw Error(`Missing top-level handler: ${handler}`);
}
