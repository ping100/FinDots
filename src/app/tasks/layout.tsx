import { DataProvider } from "@/components/tasks/DataProvider";
import { Shell } from "@/components/tasks/Shell";

/**
 * Раздел задач. Свои данные и своя нижняя панель — денежные кошельки и
 * курсы валют задачам ни к чему, а грузить их ради списка дел значило бы
 * заставлять человека ждать чужое.
 */
export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <Shell>{children}</Shell>
    </DataProvider>
  );
}
