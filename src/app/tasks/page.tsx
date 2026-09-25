"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { dayLabel, today } from "@/lib/tasks/dates";
import type { DragPayload, DropTarget, Task } from "@/lib/tasks/types";
import { useStore } from "@/components/tasks/DataProvider";
import { useAddAction } from "@/components/tasks/Shell";
import { Calendar } from "@/components/tasks/Calendar";
import { TaskList } from "@/components/tasks/TaskList";
import { QuickAdd } from "@/components/tasks/QuickAdd";
import { AppSwitchPill } from "@/components/AppSwitch";
import { Icon } from "@/lib/icons";

export default function TodayPage() {
  const { tasks, categories, toggleDone, saveTask, deleteTask, rescheduleTask } = useStore();

  const [selected, setSelected] = useState(today());
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Короткое удержание: обычный тап остаётся тапом и открывает задачу,
      // вертикальный скролл списка не превращается в перетаскивание.
      activationConstraint: { delay: 160, tolerance: 8 },
    }),
  );

  const openNew = useCallback(() => {
    setEditingTask(null);
    setSheetOpen(true);
  }, []);
  // «+» рисует нижняя панель — окно открывается отсюда, потому что здесь
  // известен выбранный в календаре день.
  useAddAction(openNew);

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setSheetOpen(true);
  };

  // Фильтр по категории — единственное, чего категориям не хватало раньше:
  // можно было завесить задачу цветным кружком, но не посмотреть только
  // «Работу» отдельно от всего остального.
  const byCategory = (list: Task[]) =>
    categoryFilter ? list.filter((t) => t.category_id === categoryFilter) : list;
  const liveCategories = categories.filter((c) => !c.archived);

  const dayTasks = byCategory(tasks.filter((t) => t.date === selected));
  const untimed = dayTasks.filter((t) => !t.time && !t.done);
  const timed = dayTasks.filter((t) => t.time && !t.done);
  const done = dayTasks.filter((t) => t.done);
  const unscheduled = byCategory(tasks.filter((t) => t.date === null && !t.done));

  const loadedDates = useMemo(
    () => new Set(tasks.filter((t) => !t.done && t.date).map((t) => t.date as string)),
    [tasks],
  );

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const payload = event.active.data.current as DragPayload | undefined;
    const target = event.over?.data.current as DropTarget | undefined;
    if (!payload || !target) return;
    void rescheduleTask(payload.taskId, target.date);
  };

  const draggedTask = dragging ? tasks.find((t) => t.id === dragging) : null;

  return (
    <DndContext
      id="todots"
      sensors={sensors}
      collisionDetection={pointerWithin}
      // Лента дат прокручивается, и однажды снятые координаты кружков
      // устаревают: задача уезжала на день, соседний с тем, куда её бросили.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={(event: DragStartEvent) => {
        setDragging(event.active.id as string);
        if (navigator.vibrate) navigator.vibrate(8);
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="mx-auto w-full max-w-md px-4 pb-32">
        <header className="flex items-center justify-between py-3">
          <h1 className="text-xl font-semibold">{dayLabel(selected)}</h1>
          <AppSwitchPill from="tasks" />
        </header>

        <Calendar selected={selected} onSelect={setSelected} loadedDates={loadedDates} />

        {liveCategories.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {liveCategories.map((c) => {
              const on = categoryFilter === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setCategoryFilter(on ? null : c.id)}
                  aria-pressed={on}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white transition"
                  style={{
                    background: c.color,
                    opacity: categoryFilter && !on ? 0.4 : 1,
                    outline: on ? "2px solid var(--text)" : "none",
                    outlineOffset: 2,
                  }}
                >
                  <Icon name={c.icon} size={13} />
                  {c.name}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-4 space-y-5">
          {untimed.length || timed.length ? (
            <TaskList
              tasks={[...untimed, ...timed]}
              categories={categories}
              onToggle={toggleDone}
              onOpen={openEdit}
            />
          ) : (
            <p className="py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
              {categoryFilter ? "Пусто в этой категории" : "Пусто — самое время выдохнуть"}
            </p>
          )}

          {done.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm" style={{ color: "var(--muted)" }}>
                Выполнено ({done.length})
              </summary>
              <div className="mt-2">
                <TaskList tasks={done} categories={categories} onToggle={toggleDone} onOpen={openEdit} />
              </div>
            </details>
          ) : null}

          {unscheduled.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm" style={{ color: "var(--muted)" }}>
                Когда-нибудь ({unscheduled.length})
              </summary>
              <div className="mt-2">
                <TaskList
                  tasks={unscheduled}
                  categories={categories}
                  onToggle={toggleDone}
                  onOpen={openEdit}
                />
              </div>
            </details>
          ) : null}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {draggedTask ? (
          <div
            className="rounded-2xl px-4 py-2 text-sm font-medium text-white shadow-lg"
            style={{ background: "var(--accent)" }}
          >
            {draggedTask.title}
          </div>
        ) : null}
      </DragOverlay>

      <QuickAdd
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        task={editingTask}
        defaultDate={selected}
        categories={categories}
        onSave={saveTask}
        onDelete={deleteTask}
      />
    </DndContext>
  );
}
