import type { TodoNode } from "../domain/nodes";

const now = new Date().toISOString();

function node(
  id: string,
  title: string,
  parentId: string | null,
  order: number,
  overrides: Partial<TodoNode> = {},
): TodoNode {
  return {
    id,
    title,
    parentId,
    order,
    type: "task",
    status: "todo",
    dependsOnIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const seedNodes: TodoNode[] = [
  node("opencl", "opencl_migration", null, 0),
  node("write-type", "Expose write type", "opencl", 0, { status: "done", completedAt: now }),
  node("merge-feat", "Merge feat/openclue_migration", "opencl", 1, {
    status: "done",
    completedAt: now,
  }),
  node("release-1186", "Release RC 1.18.6.rc", "opencl", 2, {
    status: "in_progress",
    note: "feat_openclue_frame_range.3",
  }),
  node("update-alias", "Update RC alias", "opencl", 3, {
    dependsOnIds: ["release-1186"],
  }),
  node("frame-spec", "Make sure openclue frame spec support don't break nuke 11", "opencl", 4, {
    dependsOnIds: ["release-1186"],
  }),
  node("render-token", "Add render_order token to DB name", "opencl", 5),
  node("batch-render", "yard_batch_render", null, 1, { collapsed: true }),
  node("frame-range", "yard_frame_range", null, 2),
  node("support-frame", "support openclue frame range spec", "frame-range", 0, {
    status: "done",
    completedAt: now,
  }),
  node("release-044", "Release RC 0.4.4.rc", "frame-range", 1, {
    note: "feat_openclue_migration.1",
    dependsOnIds: ["update-alias"],
  }),
  node("aliases-044", "Update RC aliases", "frame-range", 2),
];
