export const siteConfig = {
  name: "finetuning",
  strapline: "Runnable chat and embedding fine-tuning workflows",
  description:
    "Documentation for reproducible chat and embedding data, distillation, training, evaluation, resume, and export workflows.",
  repoUrl: "https://github.com/amxv/finetuning",
  footerSections: [
    {
      title: "finetuning",
      text: "Build reproducible chat and embedding datasets and carry them through evaluation and portable export.",
    },
    {
      title: "What this site covers",
      text: "Separate Chat and Embeddings tracks plus shared manifests, providers, compliance, reproducibility, and resume guidance.",
    },
    {
      title: "Repository",
      linkPrefix: "Source: ",
      linkHref: "https://github.com/amxv/finetuning",
      linkLabel: "github.com/amxv/finetuning",
    },
  ],
} as const;

export const docCategories = [
  "Start",
  "Concepts",
  "Tutorials",
  "How-to",
  "Reference",
  "Operations",
  "Security",
  "Project",
] as const;

export const primaryNav = [
  { href: "/", label: "Overview" },
  { href: "/docs", label: "Docs" },
  { href: siteConfig.repoUrl, label: "GitHub", external: true },
];
