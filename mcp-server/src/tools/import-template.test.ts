import { describe, it, expect } from "vitest";
import { analyzeMarkdownStructure } from "./import-template.js";

describe("import-template — analyzeMarkdownStructure", () => {
  it("detects H1 headers", () => {
    const structure = analyzeMarkdownStructure("# Title");
    expect(structure).toContain("H1: Title");
  });

  it("detects H2 headers", () => {
    const structure = analyzeMarkdownStructure("## Subtitle");
    expect(structure).toContain("H2: Subtitle");
  });

  it("detects H3 headers", () => {
    const structure = analyzeMarkdownStructure("### Section");
    expect(structure).toContain("H3: Section");
  });

  it("detects tables", () => {
    const md = "| Col1 | Col2 |\n|------|------|\n| A | B |";
    const structure = analyzeMarkdownStructure(md);
    expect(structure).toContain("TABLE");
  });

  it("reports TABLE only once for multi-row tables", () => {
    const md = "| A | B |\n| C | D |\n| E | F |";
    const structure = analyzeMarkdownStructure(md);
    const tableCount = structure.filter((s) => s === "TABLE").length;
    expect(tableCount).toBe(1);
  });

  it("ignores separator rows in tables", () => {
    const md = "|------|------|";
    const structure = analyzeMarkdownStructure(md);
    expect(structure).not.toContain("TABLE");
  });

  it("parses complex document structure", () => {
    const md = [
      "# Plan",
      "## Goals",
      "### Objectives",
      "Some text",
      "| Col1 | Col2 |",
      "|------|------|",
      "| A | B |",
      "## Summary",
    ].join("\n");

    const structure = analyzeMarkdownStructure(md);
    expect(structure).toEqual([
      "H1: Plan",
      "H2: Goals",
      "H3: Objectives",
      "TABLE",
      "H2: Summary",
    ]);
  });

  it("returns empty array for empty content", () => {
    const structure = analyzeMarkdownStructure("");
    expect(structure).toHaveLength(0);
  });

  it("returns empty array for content with no structure", () => {
    const structure = analyzeMarkdownStructure("Just plain text\nAnother line");
    expect(structure).toHaveLength(0);
  });
});
