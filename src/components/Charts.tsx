"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const GREEN = "#2f6b4f";
const GOLD = "#c7892b";
const RED = "#b03a2e";
const PALETTE = ["#2f6b4f", "#c7892b", "#4f8fb0", "#8e6bb0", "#b0744f", "#6c8f3a", "#b04f7d", "#5d6b62", "#3a7c7c"];

export type MonthlyPoint = { month: string; income: number; expense: number; newPatients: number; visits: number };

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export function RevenueChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e3e9e5" />
        <XAxis dataKey="month" fontSize={12} />
        <YAxis fontSize={12} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        <Tooltip formatter={(v) => inr(Number(v))} />
        <Legend />
        <Bar dataKey="income" name="Income" fill={GREEN} />
        <Bar dataKey="expense" name="Expenses" fill={RED} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PatientsChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e3e9e5" />
        <XAxis dataKey="month" fontSize={12} />
        <YAxis fontSize={12} allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="newPatients" name="New patients" stroke={GOLD} strokeWidth={2} />
        <Line type="monotone" dataKey="visits" name="Completed visits" stroke={GREEN} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SourceChart({ data }: { data: { source: string; patients: number }[] }) {
  if (data.length === 0) return <p className="muted">No patients in this period.</p>;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Tooltip />
        <Legend />
        <Pie data={data} dataKey="patients" nameKey="source" outerRadius={100} label>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ServiceChart({ data }: { data: { service: string; income: number }[] }) {
  if (data.length === 0) return <p className="muted">No income in this period.</p>;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e3e9e5" />
        <XAxis type="number" fontSize={12} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        <YAxis type="category" dataKey="service" fontSize={12} width={120} />
        <Tooltip formatter={(v) => inr(Number(v))} />
        <Bar dataKey="income" name="Income" fill={GREEN} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function InventoryChart({ data }: { data: { name: string; stock: number; reorder: number }[] }) {
  if (data.length === 0) return <p className="muted">No medicines yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e3e9e5" />
        <XAxis type="number" fontSize={12} />
        <YAxis type="category" dataKey="name" fontSize={12} width={130} />
        <Tooltip />
        <Legend />
        <Bar dataKey="stock" name="In stock" fill={GREEN} />
        <Bar dataKey="reorder" name="Reorder at" fill={GOLD} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ExpenseCategoryChart({ data }: { data: { category: string; amount: number }[] }) {
  if (data.length === 0) return <p className="muted">No expenses in this period.</p>;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Tooltip formatter={(v) => inr(Number(v))} />
        <Legend />
        <Pie data={data} dataKey="amount" nameKey="category" outerRadius={100} label>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
