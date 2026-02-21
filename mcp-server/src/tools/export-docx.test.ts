import { describe, it, expect } from "vitest";
import { Paragraph, Table } from "docx";
import { parseMarkdownToDocx, parseInlineFormatting, createTable } from "./export-docx.js";

describe("export-docx — parseInlineFormatting", () => {
  it("parses plain text", () => {
    const runs = parseInlineFormatting("Hello world");
    expect(runs).toHaveLength(1);
  });

  it("parses bold text", () => {
    const runs = parseInlineFormatting("text **bold** text");
    expect(runs).toHaveLength(3);
  });

  it("parses italic text", () => {
    const runs = parseInlineFormatting("text *italic* text");
    expect(runs).toHaveLength(3);
  });

  it("parses inline code", () => {
    const runs = parseInlineFormatting("text `code` text");
    expect(runs).toHaveLength(3);
  });

  it("parses mixed formatting", () => {
    const runs = parseInlineFormatting("**bold** and *italic* and `code`");
    expect(runs.length).toBeGreaterThanOrEqual(5);
  });
});

describe("export-docx — createTable", () => {
  it("returns empty array for empty rows", () => {
    const result = createTable([]);
    expect(result).toHaveLength(0);
  });

  it("returns a Table object for valid rows", () => {
    const result = createTable([
      ["Header 1", "Header 2"],
      ["Cell 1", "Cell 2"],
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(Table);
  });

  it("handles single-column tables", () => {
    const result = createTable([
      ["Only column"],
      ["Value 1"],
      ["Value 2"],
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(Table);
  });
});

describe("export-docx — parseMarkdownToDocx", () => {
  it("parses headings", () => {
    const elements = parseMarkdownToDocx("# H1\n## H2\n### H3");
    expect(elements).toHaveLength(3);
    elements.forEach((el) => expect(el).toBeInstanceOf(Paragraph));
  });

  it("parses bullet lists", () => {
    const elements = parseMarkdownToDocx("- item 1\n- item 2\n- item 3");
    expect(elements).toHaveLength(3);
  });

  it("parses numbered lists", () => {
    const elements = parseMarkdownToDocx("1. first\n2. second\n3. third");
    expect(elements).toHaveLength(3);
  });

  it("parses tables as Table objects (not empty paragraphs)", () => {
    const md = "| Col1 | Col2 |\n|------|------|\n| A | B |\n| C | D |";
    const elements = parseMarkdownToDocx(md);
    const tables = elements.filter((el) => el instanceof Table);
    expect(tables.length).toBeGreaterThanOrEqual(1);
  });

  it("parses mixed content", () => {
    const md = [
      "# Title",
      "",
      "Some paragraph text",
      "",
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "- list item",
    ].join("\n");

    const elements = parseMarkdownToDocx(md);
    expect(elements.length).toBeGreaterThanOrEqual(4);

    const tables = elements.filter((el) => el instanceof Table);
    expect(tables.length).toBe(1);
  });

  it("handles empty markdown", () => {
    const elements = parseMarkdownToDocx("");
    expect(elements).toHaveLength(0);
  });

  it("handles markdown with only blank lines", () => {
    const elements = parseMarkdownToDocx("\n\n\n");
    expect(elements).toHaveLength(0);
  });
});
