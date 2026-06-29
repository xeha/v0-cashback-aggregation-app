import { ClientResponseError } from "pocketbase"

export function makeClientResponseError(
  status: number,
  data?: Record<string, unknown>,
): ClientResponseError {
  return new ClientResponseError({
    url: "http://127.0.0.1:8090/api/collections/users/auth-with-password",
    status,
    response: data ? { data } : {},
    isAbort: false,
    originalError: null,
  })
}
