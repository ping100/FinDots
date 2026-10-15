import { Landing } from "@/components/landing/Landing";

/**
 * Лендинг по прямой ссылке — виден всем, даже вошедшим: посмотреть, как
 * его видят гости, или поделиться им. На главной гость видит тот же.
 */
export default function Welcome() {
  return <Landing />;
}
