"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ABSORB, FLY_BACK, buzz, landOn } from "@/lib/dragFx";
import { addDays, dayLabel, shortDay, today } from "@/lib/tasks/dates";
import type { DragPayload, DropTarget, Task } from "@/lib/tasks/types";
import { useStore } from "@/components/tasks/DataProvider";
import { useAddAction } from "@/components/tasks/Shell";
import { Calendar } from "@/components/tasks/Calendar";
import { TaskList } from "@/components/tasks/TaskList";
import { QuickAdd } from "@/components/tasks/QuickAdd";
import { WellnessCard } from "@/components/tasks/WellnessCard";
import { AppSwitchPill } from "@/components/AppSwitch";
import { DayProgress, EmptyDay, TimeGroups } from "@/components/tasks/DayParts";
import { Icon } from "@/lib/icons";

export default function TodayPage() {
  const { tasks, categories, toggleDone, saveTask, deleteTask, rescheduleTask, rescheduleMany } = useStore();

  const [selected, setSelected] = useState(today());
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // Над каким днём сейчас задача — для вибрации и анимации броска.
  const [overId, setOverId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      // Мышью — короткое удержание: клик остаётся кликом и открывает задачу.
      activationConstraint: { delay: 160, tolerance: 8 },
    }),
    // Пальцем — свайп прокручивает список, а задачу берёт только задержка
    // на ней. С PointerSensor карточкам приходилось запрещать прокрутку
    // (touch-action: none), и длинный список не листался вовсе.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
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

  // Только что выполненные ещё ~секунду стоят на месте и доигрывают
  // анимацию: галочка, зачёркивание, уход в «Выполнено».
  const [settling, setSettling] = useState<Set<string>>(() => new Set());
  const active = (t: Task) => !t.done || settling.has(t.id);

  const dayTasks = byCategory(tasks.filter((t) => t.date === selected));
  const untimed = dayTasks.filter((t) => !t.time && active(t));
  const timed = dayTasks.filter((t) => t.time && active(t));
  const done = dayTasks.filter((t) => t.done && !settling.has(t.id));
  const unscheduled = byCategory(tasks.filter((t) => t.date === null && active(t)));
  // Не сделанные в свой день и без «Переносить на следующий день» —
  // остаются на своём дне, но видны здесь, чтобы не потеряться в календаре.
  const now = today();
  const overdue =
    selected === now
      ? byCategory(tasks.filter((t) => active(t) && !t.carry_over && t.date !== null && t.date < now))
      : [];

  const loadedDates = useMemo(
    () => new Set(tasks.filter((t) => !t.done && t.date).map((t) => t.date as string)),
    [tasks],
  );

  // Всплывашка с «Вернуть» после выполнения и свайпа.
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = (text: string, undo: () => void) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const complete = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    void toggleDone(id);
    if (task.done) return; // сняли галочку — это и есть «вернуть»
    buzz([8, 30, 12]);
    setSettling((prev) => new Set(prev).add(id));
    window.setTimeout(
      () =>
        setSettling((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        }),
      900,
    );
    showToast(task.repeat ? "Выполнено — следующая уже в календаре" : "Выполнено", () => {
      setToast(null);
      setSettling((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      void toggleDone(id);
    });
  };

  /** Свайп влево: пропущенная — на сегодня, остальные — на день позже. */
  const postponeTo = (task: Task) => (!task.date || task.date < now ? now : addDays(task.date, 1));
  const postponeLabel = (task: Task) => {
    const to = postponeTo(task);
    return to === now ? "Сегодня" : to === addDays(now, 1) ? "Завтра" : shortDay(to);
  };
  const postpone = (task: Task) => {
    const to = postponeTo(task);
    const label = postponeLabel(task);
    void rescheduleTask(task.id, to);
    showToast(`Перенесено: ${label.toLowerCase()}`, () => {
      setToast(null);
      void saveTask({ id: task.id, date: task.date, carried_from: task.carried_from });
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const payload = event.active.data.current as DragPayload | undefined;
    const target = event.over?.data.current as DropTarget | undefined;
    if (!payload || !target || !event.over) {
      setOverId(null);
      return;
    }
    landOn(String(event.over.id));
    buzz([10, 40, 14]);
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
        setOverId(null);
        buzz(8);
      }}
      onDragOver={(event: DragOverEvent) => {
        const id = event.over ? String(event.over.id) : null;
        if (id && id !== overId) buzz(5);
        setOverId(id);
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragging(null);
        setOverId(null);
      }}
    >
      <div className="mx-auto w-full max-w-md px-4 pb-32">
        <header className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold">{dayLabel(selected)}</h1>
            <DayProgress done={dayTasks.filter((t) => t.done).length} total={dayTasks.length} />
          </div>
          <AppSwitchPill />
        </header>

        <Calendar selected={selected} onSelect={setSelected} loadedDates={loadedDates} />

        {selected === today() ? <WellnessCard /> : null}

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
          {overdue.length > 0 ? (
            // Качнётся один раз при появлении — чтобы пропущенное заметили.
            <section
              className="animate-nudge rounded-2xl p-2"
              style={{
                background: "color-mix(in srgb, var(--danger) 6%, transparent)",
                border: "1px solid color-mix(in srgb, var(--danger) 22%, transparent)",
              }}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2 pl-1.5">
                <span className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
                  Пропущено · {overdue.length}
                </span>
                <button
                  onClick={() => void rescheduleMany(overdue.map((t) => t.id), now)}
                  className="rounded-full px-3 py-1 text-xs font-medium text-white transition active:scale-95"
                  style={{ background: "var(--accent)" }}
                >
                  Всё на сегодня
                </button>
              </div>
              <TaskList
                tasks={overdue}
                categories={categories}
                onToggle={complete}
                onOpen={openEdit}
                overdue
                settling={settling}
                onSwipeLeft={postpone}
                swipeLabel={postponeLabel}
              />
              <p className="mt-1.5 px-1.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                Отметьте сделанное или перетащите задачу на нужный день
              </p>
            </section>
          ) : null}

          {untimed.length || timed.length ? (
            <TimeGroups
              untimed={untimed}
              timed={timed}
              render={(list) => (
                <TaskList
                  tasks={list}
                  categories={categories}
                  onToggle={complete}
                  onOpen={openEdit}
                  settling={settling}
                  onSwipeLeft={postpone}
                  swipeLabel={postponeLabel}
                />
              )}
            />
          ) : overdue.length ? null : (
            <EmptyDay
              filtered={!!categoryFilter}
              allDone={done.length > 0}
              isToday={selected === now}
              past={selected < now}
            />
          )}

          {done.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm" style={{ color: "var(--muted)" }}>
                Выполнено ({done.length})
              </summary>
              <div className="mt-2">
                <TaskList tasks={done} categories={categories} onToggle={complete} onOpen={openEdit} />
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
                  onToggle={complete}
                  onOpen={openEdit}
                  settling={settling}
                  onSwipeLeft={postpone}
                  swipeLabel={postponeLabel}
                />
              </div>
            </details>
          ) : null}
        </div>
      </div>

      <DragOverlay dropAnimation={overId ? ABSORB : FLY_BACK}>
        {draggedTask ? (
          <div
            data-ghost
            className="animate-lift-card rounded-2xl px-4 py-2 text-sm font-medium text-white"
            style={{ background: "var(--accent)", boxShadow: "0 14px 30px rgba(0,0,0,0.22)" }}
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
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4">
          <div
            className="animate-rise pointer-events-auto flex items-center gap-3 rounded-full py-2 pl-4 pr-2 text-sm shadow-lg"
            style={{ background: "var(--text)", color: "var(--bg)" }}
          >
            <span>{toast.text}</span>
            <button
              onClick={toast.undo}
              className="rounded-full px-3 py-1 text-sm font-semibold transition active:scale-95"
              style={{ background: "color-mix(in srgb, var(--bg) 18%, transparent)" }}
            >
              Вернуть
            </button>
          </div>
        </div>
      ) : null}
    </DndContext>
  );
}
