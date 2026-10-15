// El lenguaje de los campos calculados (ADR 090): numeros, referencias a
// campos, las cuatro operaciones, minimo, maximo y «si». Es un analizador
// descendente de unas decenas de lineas a proposito: `eval` o un interprete
// general serian una puerta a ejecutar lo que escriba cualquiera con permiso
// para definir campos, y una dependencia para algo de este tamano no se
// justifica.
//
// Se escribe como en una hoja de calculo en castellano: `;` separa argumentos
// y la coma decimal vale entre cifras (`1,5`). Un nombre con espacios va entre
// llaves —`{Horas previstas}`—; uno de una sola palabra puede ir sin ellas.

export type FormulaBuiltin = "estimate" | "logged";

export type CompareOperator = ">" | "<" | ">=" | "<=" | "=" | "<>";
export type ArithmeticOperator = "+" | "-" | "*" | "/";

export type FormulaNode =
  | { kind: "number"; value: string }
  | { kind: "empty" }
  /** Un nombre aun sin resolver, tal como lo escribio quien define el campo. */
  | { kind: "name"; name: string; at: number }
  | { kind: "field"; key: string }
  | { kind: "builtin"; name: FormulaBuiltin }
  | { kind: "negate"; operand: FormulaNode }
  | {
      kind: "binary";
      op: ArithmeticOperator;
      left: FormulaNode;
      right: FormulaNode;
    }
  | {
      kind: "compare";
      op: CompareOperator;
      left: FormulaNode;
      right: FormulaNode;
    }
  | {
      kind: "if";
      condition: FormulaNode;
      whenTrue: FormulaNode;
      whenFalse: FormulaNode;
    }
  | { kind: "min" | "max"; args: FormulaNode[] };

export class FormulaError extends Error {
  /** Posicion (desde 0) del caracter donde se detecto, si la hay. */
  readonly at: number | null;

  constructor(message: string, at: number | null = null) {
    super(at === null ? message : `${message} (at character ${at + 1})`);
    this.name = "FormulaError";
    this.at = at;
  }
}

export const MAX_FORMULA_LENGTH = 500;

type Token =
  | { type: "number"; value: string; at: number }
  | { type: "word"; value: string; at: number }
  | { type: "name"; value: string; at: number }
  | { type: "op"; value: string; at: number }
  | { type: "end"; at: number };

// Cada simbolo que se acepta, con su forma canonica. Los tipograficos (`÷`,
// `×`, `−`, `≥`) estan porque son los que pinta la interfaz al mostrar una
// formula: copiarla de ahi y pegarla tiene que funcionar.
const OPERATORS: Array<[string, string]> = [
  [">=", ">="],
  ["<=", "<="],
  ["<>", "<>"],
  ["!=", "<>"],
  ["≥", ">="],
  ["≤", "<="],
  ["≠", "<>"],
  [">", ">"],
  ["<", "<"],
  ["=", "="],
  ["+", "+"],
  ["-", "-"],
  ["−", "-"],
  ["*", "*"],
  ["×", "*"],
  ["·", "*"],
  ["/", "/"],
  ["÷", "/"],
  ["(", "("],
  [")", ")"],
  [";", ";"],
  [",", ";"],
];

const WORD = /[\p{L}_][\p{L}\p{N}_]*/uy;
const NUMBER = /\d+(?:[.,]\d+)?/y;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index] as string;

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    NUMBER.lastIndex = index;
    const number = NUMBER.exec(source);
    if (number) {
      tokens.push({
        type: "number",
        value: number[0].replace(",", "."),
        at: index,
      });
      index += number[0].length;
      continue;
    }

    if (char === "{") {
      const close = source.indexOf("}", index + 1);
      if (close === -1) {
        throw new FormulaError("A field name is missing its closing }", index);
      }
      const name = source.slice(index + 1, close).trim();
      if (!name) throw new FormulaError("Empty field name {}", index);
      tokens.push({ type: "name", value: name, at: index });
      index = close + 1;
      continue;
    }

    WORD.lastIndex = index;
    const word = WORD.exec(source);
    if (word) {
      tokens.push({ type: "word", value: word[0], at: index });
      index += word[0].length;
      continue;
    }

    const operator = OPERATORS.find(([symbol]) =>
      source.startsWith(symbol, index),
    );
    if (operator) {
      tokens.push({ type: "op", value: operator[1], at: index });
      index += operator[0].length;
      continue;
    }

    throw new FormulaError(`Unexpected character "${char}"`, index);
  }

  tokens.push({ type: "end", at: source.length });
  return tokens;
}

/** Sin mayusculas ni tildes: `Vacío`, `vacio` y `VACIO` son la misma palabra. */
export function normalizeWord(word: string) {
  return word
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const EMPTY_WORDS = new Set(["vacio", "empty"]);
const IF_WORDS = new Set(["si", "if"]);
const MIN_WORDS = new Set(["min", "minimo"]);
const MAX_WORDS = new Set(["max", "maximo"]);

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.position] as Token;
  }

  private next(): Token {
    const token = this.peek();
    this.position += 1;
    return token;
  }

  private isOp(value: string) {
    const token = this.peek();
    return token.type === "op" && token.value === value;
  }

  private expectOp(value: string, what: string) {
    const token = this.peek();
    if (token.type !== "op" || token.value !== value) {
      throw new FormulaError(`Expected ${what}`, token.at);
    }
    this.position += 1;
  }

  parse(): FormulaNode {
    const node = this.parseComparison();
    const token = this.peek();
    if (token.type !== "end") {
      throw new FormulaError(
        token.type === "word" || token.type === "name"
          ? `Unexpected "${token.value}": a name with spaces goes between braces, like {Planned hours}`
          : "Unexpected text after the end of the formula",
        token.at,
      );
    }
    return node;
  }

  private parseComparison(): FormulaNode {
    const left = this.parseAdditive();
    const token = this.peek();
    if (
      token.type === "op" &&
      [">", "<", ">=", "<=", "=", "<>"].includes(token.value)
    ) {
      this.next();
      const right = this.parseAdditive();
      return {
        kind: "compare",
        op: token.value as CompareOperator,
        left,
        right,
      };
    }
    return left;
  }

  private parseAdditive(): FormulaNode {
    let left = this.parseMultiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.next() as { value: ArithmeticOperator };
      const right = this.parseMultiplicative();
      left = { kind: "binary", op: op.value, left, right };
    }
    return left;
  }

  private parseMultiplicative(): FormulaNode {
    let left = this.parseUnary();
    while (this.isOp("*") || this.isOp("/")) {
      const op = this.next() as { value: ArithmeticOperator };
      const right = this.parseUnary();
      left = { kind: "binary", op: op.value, left, right };
    }
    return left;
  }

  private parseUnary(): FormulaNode {
    if (this.isOp("-")) {
      this.next();
      return { kind: "negate", operand: this.parseUnary() };
    }
    if (this.isOp("+")) {
      this.next();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parseArguments(): FormulaNode[] {
    this.expectOp("(", "(");
    const args: FormulaNode[] = [];
    if (!this.isOp(")")) {
      args.push(this.parseComparison());
      while (this.isOp(";")) {
        this.next();
        args.push(this.parseComparison());
      }
    }
    this.expectOp(")", "; or ) to close the function");
    return args;
  }

  private parsePrimary(): FormulaNode {
    const token = this.peek();

    if (token.type === "number") {
      this.next();
      return { kind: "number", value: token.value };
    }

    if (token.type === "name") {
      this.next();
      return { kind: "name", name: token.value, at: token.at };
    }

    if (token.type === "op" && token.value === "(") {
      this.next();
      const inner = this.parseComparison();
      this.expectOp(")", ") to close the parenthesis");
      return inner;
    }

    if (token.type === "word") {
      this.next();
      const word = normalizeWord(token.value);
      const isCall = this.isOp("(");

      if (EMPTY_WORDS.has(word) && !isCall) return { kind: "empty" };

      if (isCall && IF_WORDS.has(word)) {
        const args = this.parseArguments();
        if (args.length < 2 || args.length > 3) {
          throw new FormulaError(
            `${token.value}() takes a condition, a value and, optionally, another value`,
            token.at,
          );
        }
        const [condition, whenTrue, whenFalse] = args as [
          FormulaNode,
          FormulaNode,
          FormulaNode | undefined,
        ];
        return {
          kind: "if",
          condition,
          whenTrue,
          whenFalse: whenFalse ?? { kind: "empty" },
        };
      }

      if (isCall && (MIN_WORDS.has(word) || MAX_WORDS.has(word))) {
        const args = this.parseArguments();
        if (args.length === 0) {
          throw new FormulaError(
            `${token.value}() needs at least one value`,
            token.at,
          );
        }
        return { kind: MIN_WORDS.has(word) ? "min" : "max", args };
      }

      if (isCall) {
        throw new FormulaError(
          `Unknown function "${token.value}": use si, min or max`,
          token.at,
        );
      }

      return { kind: "name", name: token.value, at: token.at };
    }

    if (token.type === "end") {
      throw new FormulaError("The formula ends too early", token.at);
    }

    throw new FormulaError(`Unexpected "${token.value}"`, token.at);
  }
}

/**
 * Comprueba que cada comparacion este donde tiene sentido —en la condicion de
 * un «si»— y que esa condicion sea una comparacion. Sin esto `{a} > 1 + 2`
 * compilaria a una suma con un booleano y fallaria en la base, no aqui.
 */
function checkShape(node: FormulaNode, asCondition = false): void {
  if (node.kind === "compare") {
    if (!asCondition) {
      throw new FormulaError(
        "A comparison only makes sense as the condition of si()",
      );
    }
    checkShape(node.left);
    checkShape(node.right);
    return;
  }
  if (asCondition) {
    throw new FormulaError(
      "The condition of si() must be a comparison, like {Budget} > 0",
    );
  }
  switch (node.kind) {
    case "negate":
      checkShape(node.operand);
      return;
    case "binary":
      checkShape(node.left);
      checkShape(node.right);
      return;
    case "if":
      checkShape(node.condition, true);
      checkShape(node.whenTrue);
      checkShape(node.whenFalse);
      return;
    case "min":
    case "max":
      for (const arg of node.args) checkShape(arg);
      return;
    default:
      return;
  }
}

export function parseFormula(source: string): FormulaNode {
  if (source.length > MAX_FORMULA_LENGTH) {
    throw new FormulaError(
      `A formula can be at most ${MAX_FORMULA_LENGTH} characters long`,
    );
  }
  if (!source.trim()) throw new FormulaError("The formula is empty");
  const node = new Parser(tokenize(source)).parse();
  checkShape(node);
  return node;
}

export type FormulaCandidate = { key: string; name: string; type: string };

/** Los tipos que una formula puede leer: los numericos y otras formulas. */
export const FORMULA_INPUT_TYPES = new Set(["number", "currency", "formula"]);

const BUILTIN_WORDS: Record<string, FormulaBuiltin> = {
  estimado: "estimate",
  estimacion: "estimate",
  estimate: "estimate",
  registrado: "logged",
  logged: "logged",
};

/**
 * Sustituye cada nombre por la clave del campo o por un valor de la tarea. Se
 * busca primero por nombre —es lo que escribe una persona—, despues por clave
 * —es lo que guarda la forma canonica, `{presupuesto}`—, y al final entre los
 * valores propios de la tarea, «Estimado» y «Registrado».
 */
export function resolveFormulaNames(
  node: FormulaNode,
  candidates: FormulaCandidate[],
): FormulaNode {
  const byName = new Map<string, FormulaCandidate[]>();
  const byKey = new Map(candidates.map((c) => [c.key, c]));
  for (const candidate of candidates) {
    const name = normalizeWord(candidate.name);
    byName.set(name, [...(byName.get(name) ?? []), candidate]);
  }

  const resolve = (current: FormulaNode): FormulaNode => {
    switch (current.kind) {
      case "name": {
        const named = byName.get(normalizeWord(current.name)) ?? [];
        if (named.length > 1) {
          throw new FormulaError(
            `More than one field is called "${current.name}": write its key between braces`,
            current.at,
          );
        }
        const candidate = named[0] ?? byKey.get(current.name);

        if (candidate) {
          if (!FORMULA_INPUT_TYPES.has(candidate.type)) {
            throw new FormulaError(
              `"${candidate.name}" is not a number, currency or calculated field`,
              current.at,
            );
          }
          return { kind: "field", key: candidate.key };
        }

        const builtin =
          BUILTIN_WORDS[normalizeWord(current.name).replace(/^:/, "")];
        if (builtin) return { kind: "builtin", name: builtin };

        throw new FormulaError(`Unknown field "${current.name}"`, current.at);
      }
      case "negate":
        return { kind: "negate", operand: resolve(current.operand) };
      case "binary":
      case "compare":
        return {
          ...current,
          left: resolve(current.left),
          right: resolve(current.right),
        } as FormulaNode;
      case "if":
        return {
          kind: "if",
          condition: resolve(current.condition),
          whenTrue: resolve(current.whenTrue),
          whenFalse: resolve(current.whenFalse),
        };
      case "min":
      case "max":
        return { kind: current.kind, args: current.args.map(resolve) };
      default:
        return current;
    }
  };

  return resolve(node);
}

/** Las claves de campo que lee una formula ya resuelta. */
export function referencedKeys(node: FormulaNode): Set<string> {
  const keys = new Set<string>();
  const walk = (current: FormulaNode) => {
    switch (current.kind) {
      case "field":
        keys.add(current.key);
        return;
      case "negate":
        walk(current.operand);
        return;
      case "binary":
      case "compare":
        walk(current.left);
        walk(current.right);
        return;
      case "if":
        walk(current.condition);
        walk(current.whenTrue);
        walk(current.whenFalse);
        return;
      case "min":
      case "max":
        current.args.forEach(walk);
        return;
      default:
        return;
    }
  };
  walk(node);
  return keys;
}

/** Si lee la estimacion o lo registrado de la rama. */
export function usesBranchValues(node: FormulaNode): boolean {
  switch (node.kind) {
    case "builtin":
      return true;
    case "negate":
      return usesBranchValues(node.operand);
    case "binary":
    case "compare":
      return usesBranchValues(node.left) || usesBranchValues(node.right);
    case "if":
      return (
        usesBranchValues(node.condition) ||
        usesBranchValues(node.whenTrue) ||
        usesBranchValues(node.whenFalse)
      );
    case "min":
    case "max":
      return node.args.some(usesBranchValues);
    default:
      return false;
  }
}

const PRECEDENCE: Record<ArithmeticOperator, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

/**
 * La forma canonica, la que se guarda: claves y no nombres —renombrar un campo
 * no puede romper las formulas que lo leen—, punto decimal y operadores ASCII.
 * Vuelve a analizarse igual: `parseFormula(formatFormula(x))` da `x`.
 */
export function formatFormula(node: FormulaNode): string {
  switch (node.kind) {
    case "number":
      return node.value;
    case "empty":
      return "vacío";
    case "name":
      return `{${node.name}}`;
    case "field":
      return `{${node.key}}`;
    case "builtin":
      return `{:${node.name}}`;
    case "negate": {
      const inner = formatFormula(node.operand);
      return node.operand.kind === "binary" ? `-(${inner})` : `-${inner}`;
    }
    case "binary": {
      const precedence = PRECEDENCE[node.op];
      const wrap = (child: FormulaNode, right: boolean) => {
        const text = formatFormula(child);
        if (child.kind !== "binary") return text;
        const childPrecedence = PRECEDENCE[child.op];
        // A la derecha de `-` o `/` el mismo nivel tambien necesita parentesis:
        // `a - (b - c)` no es `a - b - c`.
        const needs =
          childPrecedence < precedence ||
          (right && childPrecedence === precedence);
        return needs ? `(${text})` : text;
      };
      return `${wrap(node.left, false)} ${node.op} ${wrap(node.right, true)}`;
    }
    case "compare":
      return `${formatFormula(node.left)} ${node.op} ${formatFormula(node.right)}`;
    case "if":
      return `si(${formatFormula(node.condition)}; ${formatFormula(node.whenTrue)}; ${formatFormula(node.whenFalse)})`;
    case "min":
    case "max":
      return `${node.kind}(${node.args.map(formatFormula).join("; ")})`;
  }
}
