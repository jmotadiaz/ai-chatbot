const LEADING_SKILL_COMMANDS =
  /^((?:\/skill:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:[ \t]+|(?=\r?\n|$)))+)([\s\S]*)$/;

const SKILL_NAME = /\/skill:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/g;

export interface ParsedSkillCommands {
  skills: string[];
  text: string;
}

export function parseLeadingSkillCommands(
  value: string,
): ParsedSkillCommands {
  const match = value.match(LEADING_SKILL_COMMANDS);
  if (!match) return { skills: [], text: value };

  const skills = Array.from(
    match[1]!.matchAll(SKILL_NAME),
    (command) => command[1]!,
  );
  return {
    skills,
    text: match[2]!.replace(/^\s+/, ""),
  };
}

export function prependSkillCommands(
  text: string,
  skills: readonly string[],
): string {
  if (skills.length === 0) return text;
  const commands = skills.map((skill) => `/skill:${skill}`).join(" ");
  return text ? `${commands}\n\n${text}` : commands;
}
