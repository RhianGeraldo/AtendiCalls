export type PlaybookObjection = {
  trigger: string;
  response: string;
};

export type PlaybookStage = {
  id: string;
  title: string;
  script: string;
  objections?: PlaybookObjection[];
};

export type StructuredPlaybook = {
  mode: "stages";
  stages: PlaybookStage[];
};

export type Playbook = {
  id: string;
  title: string;
  content: string; // Plain text or JSON string of StructuredPlaybook
  category?: string;
  createdAt: number;
  updatedAt: number;
};

export const parsePlaybookContent = (content: string): { mode: "text" | "stages"; text: string; stages: PlaybookStage[] } => {
  if (!content) {
    return { mode: "text", text: "", stages: [] };
  }

  try {
    const json = JSON.parse(content);
    if (json && json.mode === "stages" && Array.isArray(json.stages)) {
      return {
        mode: "stages",
        text: content,
        stages: json.stages,
      };
    }
  } catch {}

  return {
    mode: "text",
    text: content,
    stages: [],
  };
};

export const serializePlaybookContent = (mode: "text" | "stages", text: string, stages: PlaybookStage[]): string => {
  if (mode === "stages") {
    return JSON.stringify({
      mode: "stages",
      stages: stages,
    });
  }
  return text;
};
