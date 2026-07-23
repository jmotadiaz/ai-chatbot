const REPOSITORY_LOCAL_GIT_ENV_KEYS = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_DIR",
  "GIT_GRAFT_FILE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_REPLACE_REF_BASE",
  "GIT_SHALLOW_FILE",
  "GIT_WORK_TREE",
] as const;

/**
 * Git exports repository-local variables while running hooks. Tests that
 * create another repository must not inherit those paths, especially the
 * parent commit's temporary GIT_INDEX_FILE.
 */
export function clearInheritedGitRepositoryEnv(): () => void {
  const saved = new Map<string, string>();

  for (const key of REPOSITORY_LOCAL_GIT_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) saved.set(key, value);
    delete process.env[key];
  }

  return () => {
    for (const key of REPOSITORY_LOCAL_GIT_ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}
