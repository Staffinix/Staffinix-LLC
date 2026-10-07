import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function listTsx(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTsx(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

function tagName(node) {
  return node.tagName?.getText() ?? "";
}

function attributes(node) {
  return node.attributes?.properties ?? [];
}

function hasAttribute(node, name) {
  return attributes(node).some(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === name,
  );
}

function stringAttribute(node, name) {
  const attribute = attributes(node).find(
    (candidate) => ts.isJsxAttribute(candidate) && candidate.name.text === name,
  );
  return attribute && ts.isJsxAttribute(attribute) && ts.isStringLiteral(attribute.initializer)
    ? attribute.initializer.text
    : null;
}

function wrappedByTrigger(node) {
  let parent = node.parent;
  while (parent && !ts.isSourceFile(parent)) {
    if (ts.isJsxElement(parent)) {
      const name = tagName(parent.openingElement);
      if (name.endsWith("Trigger") && hasAttribute(parent.openingElement, "asChild")) return true;
    }
    parent = parent.parent;
  }
  return false;
}

const failures = [];
const uiComponentsSegment = join("components", "ui");

for (const file of listTsx("src").filter((path) => !path.includes(uiComponentsSegment))) {
  const sourceText = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.text === "onClick" && node.initializer) {
      const expression = ts.isJsxExpression(node.initializer) ? node.initializer.expression : null;
      if (
        expression &&
        ts.isArrowFunction(expression) &&
        ts.isBlock(expression.body) &&
        expression.body.statements.length === 0
      ) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        failures.push(`${file}:${line} has an empty onClick handler`);
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = tagName(node);
      if (name === "Button" || name === "button") {
        const isSubmit = stringAttribute(node, "type") === "submit";
        const isDelegated = hasAttribute(node, "asChild") || wrappedByTrigger(node);
        if (!hasAttribute(node, "onClick") && !isSubmit && !isDelegated) {
          const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          failures.push(`${file}:${line} has an inert ${name}`);
        }
      }

      for (const attributeName of ["href", "to"]) {
        if (stringAttribute(node, attributeName) === "#") {
          const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          failures.push(`${file}:${line} uses ${attributeName}=\"#\"`);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
}

assert.deepEqual(failures, [], `Inert interactive controls found:\n${failures.join("\n")}`);
console.log("Interactive control wiring check passed.");
