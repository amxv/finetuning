export const siteConfig = {
  name: "finetuning",
  strapline: "Scenario-driven OpenAI fine-tuning dataset docs",
  description:
    "Documentation for finetuning, a toolkit for deterministic and provider-backed dataset generation, validation, translation, and full tool-trajectory exports.",
  repoUrl: "https://github.com/amxv/finetuning",
  footerSections: [
    {
      title: "finetuning",
      text:
        "Generate, validate, and translate OpenAI chat fine-tuning datasets from reusable scenario definitions."
    },
    {
      title: "What this site covers",
      text:
        "Quickstarts, export modes, scenario authoring, provider configuration, validation behavior, architecture, and maintenance."
    },
    {
      title: "Repository",
      linkPrefix: "Source: ",
      linkHref: "https://github.com/amxv/finetuning",
      linkLabel: "github.com/amxv/finetuning"
    }
  ]
} as const;

export const docCategories = [
  "Start",
  "Dataset Workflows",
  "Provider Workflows",
  "Authoring",
  "Reference"
] as const;

export const primaryNav = [
  { href: "/", label: "Overview" },
  { href: "/docs", label: "Docs" },
  { href: siteConfig.repoUrl, label: "GitHub", external: true }
];
