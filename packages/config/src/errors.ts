export class ConfigError extends Error {
  constructor(
    public readonly key: string,
    message: string,
  ) {
    super(`ConfigError[${key}]: ${message}`);
    this.name = "ConfigError";
  }
}
