import Reducto from 'reductoai';

let reductoClient: Reducto | null = null;

export function getReductoClient(): Reducto {
  if (!reductoClient) {
    const apiKey = process.env.REDUCTO_API_KEY;
    if (!apiKey) {
      throw new Error("Missing REDUCTO_API_KEY environment variable");
    }
    reductoClient = new Reducto({
      apiKey,
    });
  }
  return reductoClient;
}
