import { describe, expect, it } from "vitest";
import type { Notification } from "@/types/notification";
import {
  getAnnouncementTarget,
  getNotificationContent,
  getNotificationTarget,
  getNotificationTitle,
  getProjectTarget,
} from "./notification";

const t = (key: string, options?: Record<string, unknown>) => {
  if (key === "notifications:reminderLeadTime.days") {
    return `${options?.count} days`;
  }
  if (key === "notifications:events.due_date_reminder.content") {
    return `${options?.taskTitle} is due in ${options?.leadTime}`;
  }
  if (key === "notifications:events.task_comment.title") {
    return `${options?.commenterName} commented on your task`;
  }
  if (key === "notifications:events.task_comment.content") {
    return `New comment on ${options?.taskTitle}: ${options?.commentPreview}`;
  }
  return key;
};

function notification(
  type: string,
  eventData: Record<string, unknown>,
): Notification {
  return {
    id: "notification-1",
    userId: "user-1",
    title: null,
    content: null,
    type,
    eventData,
    isRead: false,
    createdAt: "2026-07-12T10:00:00.000Z",
    updatedAt: "2026-07-12T10:00:00.000Z",
  } as unknown as Notification;
}

describe("notification display content", () => {
  it("renders configured due-date lead times", () => {
    const item = notification("due_date_reminder", {
      taskTitle: "Launch website",
      leadTimeMinutes: 2880,
    });

    expect(getNotificationTitle(item, t)).toBe(
      "notifications:events.due_date_reminder.title",
    );
    expect(getNotificationContent(item, t)).toBe(
      "Launch website is due in 2 days",
    );
  });

  it("renders comment notifications with their preview", () => {
    const item = notification("task_comment", {
      taskTitle: "Launch website",
      commenterName: "Mina",
      commentPreview: "Ready for review",
    });

    expect(getNotificationTitle(item, t)).toBe("Mina commented on your task");
    expect(getNotificationContent(item, t)).toBe(
      "New comment on Launch website: Ready for review",
    );
  });
});

describe("notification targets", () => {
  it("opens the task of a reminder", () => {
    const item = {
      ...notification("task_reminder", {
        taskTitle: "Llamar",
        projectId: "p1",
        workspaceId: "w1",
      }),
      resourceType: "task",
      resourceId: "t1",
    } as Notification;
    expect(getNotificationTarget(item)).toEqual({
      workspaceId: "w1",
      projectId: "p1",
      taskId: "t1",
    });
    expect(getAnnouncementTarget(item)).toBeNull();
  });

  it("opens the board where an announcement was posted", () => {
    const project = {
      ...notification("announcement_published", {
        projectId: "p1",
        workspaceId: "w1",
      }),
      resourceType: "announcement",
      resourceId: "a1",
    } as Notification;
    const workspace = {
      ...notification("announcement_published", {
        projectId: null,
        workspaceId: "w1",
      }),
      resourceType: "announcement",
      resourceId: "a2",
    } as Notification;
    expect(getAnnouncementTarget(project)).toEqual({
      workspaceId: "w1",
      projectId: "p1",
    });
    expect(getAnnouncementTarget(workspace)).toEqual({
      workspaceId: "w1",
      projectId: null,
    });
    expect(getNotificationTarget(project)).toBeNull();
  });

  it("opens the project whose health changed, and says which health", () => {
    const item = {
      ...notification("project_health_changed", {
        workspaceId: "w1",
        projectId: "p1",
        projectName: "Reforma nave",
        health: "at_risk",
        note: null,
      }),
      resourceType: "project",
      resourceId: "p1",
    } as Notification;
    expect(getProjectTarget(item)).toEqual({
      workspaceId: "w1",
      projectId: "p1",
    });
    expect(getNotificationTarget(item)).toBeNull();
    expect(getAnnouncementTarget(item)).toBeNull();

    const seen: Array<[string, Record<string, unknown> | undefined]> = [];
    const spy = (key: string, options?: Record<string, unknown>) => {
      seen.push([key, options]);
      return key;
    };
    getNotificationTitle(item, spy);
    expect(seen.map(([key]) => key)).toContain(
      "workspace:projects.health.at_risk",
    );
    expect(getNotificationContent(item, t)).toBe(
      "notifications:events.project_health_changed.contentWithoutNote",
    );
  });

  it("shows a reminder's note, or a fallback without one", () => {
    expect(
      getNotificationContent(
        notification("task_reminder", { taskTitle: "Llamar", note: "Cuadro" }),
        t,
      ),
    ).toBe("notifications:events.task_reminder.content");
    expect(
      getNotificationContent(
        notification("task_reminder", { taskTitle: "Llamar", note: null }),
        t,
      ),
    ).toBe("notifications:events.task_reminder.contentWithoutNote");
  });
});
