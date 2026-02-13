export const webSearchDescriptionPrompt = `
Search the web for up-to-date information.
- Input: An object with a single string property 'query'.
- Output: An array of objects, where each object represents a search result and contains 'title' (string), 'url' (string), 'content' (string), and an optional 'publishedDate' (string).
`;

export const webSearchQueryPrompt = `Optimized query for web search`;

export const urlContextDescriptionPrompt = `
Retrieves the textual content from a list of specific URLs provided by the user.
- Input: An object with a single property 'urls', which is an array of strings representing the URLs.
- Output: An array of objects, where each object contains 'title' (string).
`;

export const urlContextUrlsPrompt = `The urls provided directly in the user prompt`;
