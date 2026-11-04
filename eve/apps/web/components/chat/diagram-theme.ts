import type { MermaidConfig } from "@streamdown/mermaid";

// A reply's diagram drawn in the chat's own colours: mermaid's base theme with its variables set
// from the tokens in globals.css, light under the light theme and the negative under .dark.
// Mermaid mixes colours with a parser that reads hex and not oklch, so each token is carried here
// as its sRGB hex; test/look.test.ts holds them equal to globals.css.
export const DIAGRAM_TOKENS = {
  light: {
    "--bg": "#fafafa",
    "--bg-sunk": "#f1f1f1",
    "--bg-raise": "#ffffff",
    "--ink": "#0f0f0f",
    "--ink-2": "#383838",
    "--hair-strong": "#b1b1b1",
    "--line-ui": "#868686",
    "--accent": "#ed4423",
  },
  dark: {
    "--bg": "#0b0b0b",
    "--bg-sunk": "#141414",
    "--bg-raise": "#101010",
    "--ink": "#f2f2f2",
    "--ink-2": "#cecece",
    "--hair-strong": "#525252",
    "--line-ui": "#7a7a7a",
    "--accent": "#f6623d",
  },
} as const;

export type DiagramTheme = keyof typeof DIAGRAM_TOKENS;

function diagramConfig(theme: DiagramTheme): MermaidConfig {
  const token = DIAGRAM_TOKENS[theme];
  return {
    theme: "base",
    themeVariables: {
      darkMode: theme === "dark",
      background: token["--bg"],
      // boxes on the raised surface, outlined in the control border, labelled in the ink
      primaryColor: token["--bg-raise"],
      primaryBorderColor: token["--line-ui"],
      primaryTextColor: token["--ink"],
      secondaryColor: token["--bg-sunk"],
      secondaryBorderColor: token["--line-ui"],
      secondaryTextColor: token["--ink"],
      tertiaryColor: token["--bg-sunk"],
      tertiaryBorderColor: token["--hair-strong"],
      tertiaryTextColor: token["--ink"],
      // arrows in the second ink, their labels on the page's ground
      lineColor: token["--ink-2"],
      edgeLabelBackground: token["--bg"],
      textColor: token["--ink"],
      titleColor: token["--ink"],
      clusterBkg: token["--bg-sunk"],
      clusterBorder: token["--hair-strong"],
      // the signal red marks what a note or an activation calls out, as on the site
      noteBkgColor: token["--bg-sunk"],
      noteBorderColor: token["--accent"],
      noteTextColor: token["--ink"],
      activationBorderColor: token["--accent"],
    },
  };
}

/** Streamdown's mermaid options per theme, built once so a render keeps the same object. */
export const DIAGRAM_OPTIONS = {
  light: { config: diagramConfig("light") },
  dark: { config: diagramConfig("dark") },
} as const;
