type TechnologyDefinition = {
  domains: readonly string[];
  /** Extra spellings used when matching requirement titles and technologies. */
  aliases?: readonly string[];
};

export const TAILORING_TECHNOLOGIES = {
  Python: {
    domains: [
      "Python Developer",
      "Data Engineer",
      "Data Analyst",
      "Data Scientist",
      "Machine Learning Engineer",
      "AI Engineer",
      "Backend Developer",
      "Automation Engineer",
    ],
  },
  Java: {
    domains: [
      "Java Developer",
      "Backend Developer",
      "Full Stack Developer",
      "Microservices Developer",
      "Spring Boot Developer",
      "Android Developer",
      "Automation Test Engineer",
    ],
  },
  JavaScript: {
    domains: ["Frontend Developer", "Full Stack Developer", "Web Developer", "UI Developer"],
    aliases: ["js"],
  },
  TypeScript: {
    domains: ["Frontend Developer", "Full Stack Developer", "Backend Developer", "Web Developer"],
    aliases: ["ts"],
  },
  React: {
    domains: ["React Developer", "Frontend Developer", "Full Stack Developer", "UI Developer"],
    aliases: ["react.js", "reactjs"],
  },
  Angular: {
    domains: ["Angular Developer", "Frontend Developer", "Full Stack Developer", "UI Developer"],
    aliases: ["angularjs"],
  },
  "Node.js": {
    domains: ["Node.js Developer", "Backend Developer", "Full Stack Developer", "API Developer"],
    aliases: ["node", "nodejs"],
  },
  ".NET": {
    domains: [".NET Developer", "C# Developer", "Backend Developer", "Full Stack Developer"],
    aliases: ["dotnet", "c#", "asp.net"],
  },
  "C++": {
    domains: ["C++ Developer", "Embedded Engineer", "Systems Engineer", "Software Engineer"],
  },
  Golang: {
    domains: ["Go Developer", "Backend Developer", "Platform Engineer", "Cloud Engineer"],
    aliases: ["go"],
  },
  Kotlin: {
    domains: ["Android Developer", "Kotlin Developer", "Backend Developer", "Mobile Developer"],
  },
  Swift: {
    domains: ["iOS Developer", "Mobile Developer"],
    aliases: ["ios"],
  },
  PHP: {
    domains: ["PHP Developer", "Laravel Developer", "Backend Developer", "Web Developer"],
  },
  Ruby: {
    domains: ["Ruby on Rails Developer", "Backend Developer", "Full Stack Developer"],
    aliases: ["rails"],
  },
  SQL: {
    domains: [
      "SQL Developer",
      "Database Administrator",
      "Data Analyst",
      "Data Engineer",
      "BI Developer",
      "ETL Developer",
    ],
  },
  Snowflake: {
    domains: ["Snowflake Developer", "Data Engineer", "Data Architect", "ETL Developer"],
  },
  "Power BI": {
    domains: ["Power BI Developer", "BI Developer", "Data Analyst", "Business Analyst"],
    aliases: ["powerbi"],
  },
  Tableau: {
    domains: ["Tableau Developer", "BI Developer", "Data Analyst", "Business Analyst"],
  },
  "Machine Learning": {
    domains: [
      "Machine Learning Engineer",
      "Data Scientist",
      "AI Engineer",
      "NLP Engineer",
      "MLOps Engineer",
    ],
    aliases: ["ml", "ai"],
  },
  AWS: {
    domains: [
      "Cloud Engineer",
      "DevOps Engineer",
      "Solutions Architect",
      "Data Engineer",
      "Cloud Security Engineer",
    ],
  },
  Azure: {
    domains: ["Cloud Engineer", "DevOps Engineer", "Solutions Architect", "Data Engineer"],
  },
  GCP: {
    domains: ["Cloud Engineer", "DevOps Engineer", "Solutions Architect", "Data Engineer"],
    aliases: ["google cloud"],
  },
  Kubernetes: {
    domains: [
      "DevOps Engineer",
      "Site Reliability Engineer",
      "Platform Engineer",
      "Cloud Engineer",
    ],
    aliases: ["k8s", "docker"],
  },
  Selenium: {
    domains: ["QA Automation Engineer", "SDET", "Test Engineer"],
  },
  Salesforce: {
    domains: ["Salesforce Developer", "Salesforce Administrator", "Salesforce Consultant"],
    aliases: ["apex"],
  },
  ServiceNow: {
    domains: ["ServiceNow Developer", "ServiceNow Administrator"],
  },
  SAP: {
    domains: ["SAP Consultant", "SAP ABAP Developer", "SAP Functional Consultant"],
    aliases: ["abap"],
  },
} as const satisfies Record<string, TechnologyDefinition>;

export type TailoringTechnology = keyof typeof TAILORING_TECHNOLOGIES;

export const TECHNOLOGY_NAMES = Object.keys(TAILORING_TECHNOLOGIES) as TailoringTechnology[];

function definitionOf(technology: string | null | undefined): TechnologyDefinition | undefined {
  return technology && Object.hasOwn(TAILORING_TECHNOLOGIES, technology)
    ? TAILORING_TECHNOLOGIES[technology as TailoringTechnology]
    : undefined;
}

export function domainsForTechnology(technology: string | null | undefined): readonly string[] {
  return definitionOf(technology)?.domains ?? [];
}

export function isValidTailoringTarget(
  technology: string | null | undefined,
  domain: string | null | undefined,
): boolean {
  return Boolean(domain && definitionOf(technology)?.domains.includes(domain));
}

/** Target text comes only from the catalog, so free text never reaches the AI prompt. */
export function buildTailoringRequirement(technology: string, domain: string) {
  return {
    requirement: {
      id: `target:${technology}:${domain}`,
      title: `${domain} (${technology})`,
      description: `Target role: ${domain}. Primary technology: ${technology}.`,
      primary_technology: technology,
      location: null,
      work_mode: null,
      visa_types: [] as string[],
      min_experience_years: null,
      max_experience_years: null,
    },
    skills: [{ id: `target-skill:${technology}`, skill: technology, is_mandatory: true }],
  };
}

function containsTerm(text: string, term: string) {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9+#.])${escaped}($|[^a-z0-9+#])`).test(text);
}

/** 0 = unrelated, 1 = same technology, 2 = same technology and domain. */
export function requirementTargetFit(
  requirement: { title: string; primary_technology?: string | null },
  technology: string,
  domain: string,
): 0 | 1 | 2 {
  const definition = definitionOf(technology);
  if (!definition) return 0;
  const text = `${requirement.title} ${requirement.primary_technology ?? ""}`.toLowerCase();
  if (![technology, ...(definition.aliases ?? [])].some((term) => containsTerm(text, term))) {
    return 0;
  }
  return containsTerm(text, domain) ? 2 : 1;
}
