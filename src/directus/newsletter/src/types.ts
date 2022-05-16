type TCustomError = {
  statusCode: number;
  message: string;
};

const isCustomError = (error: unknown): error is TCustomError => {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    "message" in error &&
    typeof (error as Record<string, unknown>).message === "string" &&
    typeof (error as Record<string, unknown>).statusCode === "number"
  );
};

export { isCustomError };
export type { TCustomError };
