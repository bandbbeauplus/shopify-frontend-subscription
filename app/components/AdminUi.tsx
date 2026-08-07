import type { ReactNode } from "react";
import type { ShipmentStatus, SubscriptionStatus } from "../lib/types";
import styles from "../styles/admin.module.css";

const money = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

export function formatMoney(value: string | number) {
  return money.format(Number(value || 0));
}

export function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

export function StatusBadge({
  status,
}: {
  status: ShipmentStatus | SubscriptionStatus;
}) {
  return (
    <span className={`${styles.badge} ${styles[`status_${status}`]}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyMark}>B&amp;B</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Metric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "default" | "warm" | "green";
}) {
  return (
    <article className={`${styles.metric} ${styles[`metric_${tone}`]}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
