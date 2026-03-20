// backend/src/modules/notifications/controller.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { notificationIdParamsSchema, subscribeSchema } from "./schema.js";
import * as notificationsService from "./service.js";

export const subscribeController = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actorId = request.authUser?.id;
  if (!actorId) {
    reply.code(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication required."
    });
    return;
  }

  const input = subscribeSchema.parse(request.body);
  await notificationsService.subscribe(actorId, input);

  reply.code(201).send({
    data: true,
    message: "Subscription saved successfully."
  });
};

export const listNotificationsController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actorId = request.authUser?.id;
  if (!actorId) {
    reply.code(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication required."
    });
    return;
  }

  const actorRoles = request.authUser?.roles ?? [];
  const result = await notificationsService.listNotifications(actorId, actorRoles);

  reply.send({
    data: result.data,
    total: result.total
  });
};

export const markReadController = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const actorId = request.authUser?.id;
  if (!actorId) {
    reply.code(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication required."
    });
    return;
  }

  const { id } = notificationIdParamsSchema.parse(request.params);
  await notificationsService.markRead(actorId, id);

  reply.send({
    data: true,
    message: "Notification marked as read."
  });
};
