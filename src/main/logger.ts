import { pino } from "pino";

export const logger = pino({ name: "workadventure-desktop", level: process.env["LOG_LEVEL"] ?? "info" });
