import { NextResponse } from "next/server";
import { generateId } from "./auth/crypto";

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(
    {
      data,
      requestId: generateId("req"),
    },
    { status }
  );
}

export function apiError(
  code: string,
  message: string,
  status = 400,
  fieldErrors?: Record<string, string[]>
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        fieldErrors,
      },
      requestId: generateId("req"),
    },
    { status }
  );
}
