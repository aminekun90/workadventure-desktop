import { randomUUID } from "node:crypto";
import { DEFAULT_SPACES, addSpace, removeSpace, restoreInstances, spacesSchema, type AddSpaceResult, type NewSpace, type SpaceRef, type Spaces } from "../shared/spaces.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { logger } from "./logger.js";

/** A missing or invalid file falls back to goyan's spaces alone: it only holds launcher preferences. */
export function loadSpaces(filePath: string): Spaces {
  const content = readJsonFile(filePath);
  if (content === undefined) return DEFAULT_SPACES;
  const result = spacesSchema.safeParse(content);
  if (result.success) return result.data;
  logger.warn({ filePath, issues: result.error.issues }, "Ignoring invalid spaces file");
  return DEFAULT_SPACES;
}

export function saveNewSpace(filePath: string, request: NewSpace): AddSpaceResult {
  const result = addSpace(loadSpaces(filePath), request, randomUUID());
  if (result.ok) writeJsonFile(filePath, result.spaces);
  return result;
}

export function deleteSpace(filePath: string, ref: SpaceRef): Spaces {
  const spaces = removeSpace(loadSpaces(filePath), ref);
  writeJsonFile(filePath, spaces);
  return spaces;
}

export function restoreGoyanSpaces(filePath: string): Spaces {
  const spaces = restoreInstances(loadSpaces(filePath));
  writeJsonFile(filePath, spaces);
  return spaces;
}
