/**
 * A minimal fake of @anthropic-ai/sdk's default export, just enough for api/story.js's
 * `begin` action (messages.parse) to run with no network and a countable call count.
 */
class FakeAPIError extends Error {}
class FakeRateLimitError extends FakeAPIError {}
class FakeAuthenticationError extends FakeAPIError {}

export const state = { calls: 0, parsedOutput: null, stopReason: 'end_turn' };

export function resetFakeAnthropic(parsedOutput) {
  state.calls = 0;
  state.parsedOutput = parsedOutput;
  state.stopReason = 'end_turn';
}

export default class FakeAnthropic {
  static APIError = FakeAPIError;
  static RateLimitError = FakeRateLimitError;
  static AuthenticationError = FakeAuthenticationError;

  messages = {
    parse: async () => {
      state.calls += 1;
      return { stop_reason: state.stopReason, parsed_output: state.parsedOutput };
    },
  };

  beta = {
    messages: {
      stream: () => {
        throw new Error('fake Anthropic: streaming is not used by these tests');
      },
    },
  };
}
