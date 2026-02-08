/**
 * Built-in Typst style presets.
 * Each template is a block of #set / #show rules prepended to the user's markup.
 * The user's content follows immediately — they just write headings, paragraphs, etc.
 */

const report = `// --- report template ---
#set page(
  paper: "a4",
  margin: (x: 2.5cm, y: 3cm),
  numbering: "1",
  header: context {
    if counter(page).get().first() > 1 {
      align(right, text(size: 9pt, fill: gray.darken(30%))[
        #counter(page).display("1 / 1", both: true)
      ])
    }
  },
)
#set text(font: "New Computer Modern", size: 11pt)
#set par(justify: true, leading: 0.65em, first-line-indent: 0pt)
#set heading(numbering: "1.1  ")

#show heading.where(level: 1): it => {
  v(1.2em)
  text(size: 16pt, weight: "bold")[#it]
  v(0.4em)
  line(length: 100%, stroke: 0.5pt + gray)
  v(0.6em)
}
#show heading.where(level: 2): it => {
  v(0.8em)
  text(size: 13pt, weight: "bold")[#it]
  v(0.3em)
}
#show heading.where(level: 3): it => {
  v(0.6em)
  text(size: 11pt, weight: "bold", style: "italic")[#it]
  v(0.2em)
}

// --- end report template ---
`;

const memo = `// --- memo template ---
#set page(
  paper: "a4",
  margin: (x: 2.5cm, y: 2.5cm),
)
#set text(font: "IBM Plex Sans", size: 10.5pt)
#set par(justify: false, leading: 0.6em, first-line-indent: 0pt)

#show heading.where(level: 1): it => {
  text(size: 14pt, weight: "bold")[#it]
  v(0.2em)
  line(length: 100%, stroke: 1pt + black)
  v(0.5em)
}
#show heading.where(level: 2): it => {
  v(0.5em)
  text(size: 11pt, weight: "bold", fill: luma(80))[#it]
  v(0.2em)
}
#show heading.where(level: 3): it => {
  v(0.4em)
  text(size: 10.5pt, weight: "bold")[#it]
  v(0.15em)
}

// --- end memo template ---
`;

const letter = `// --- letter template ---
#set page(
  paper: "a4",
  margin: (top: 3cm, bottom: 2.5cm, x: 2.5cm),
)
#set text(font: "Libertinus Serif", size: 11pt)
#set par(justify: true, leading: 0.65em, first-line-indent: 0pt)

#show heading.where(level: 1): it => {
  text(size: 13pt, weight: "bold")[#it]
  v(0.3em)
}
#show heading.where(level: 2): it => {
  v(0.5em)
  text(size: 11pt, weight: "bold")[#it]
  v(0.2em)
}

// --- end letter template ---
`;

export const TEMPLATES: Record<string, string> = {
  report,
  memo,
  letter,
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);
