const stats = [
  { value: "12", label: "Day Streak", change: "Personal best" },
  { value: "$2.4k", label: "This Month", change: "Upwork + DoorDash" },
  { value: "3.8", label: "GPA", change: "On track" },
  { value: "6", label: "Open Tasks", change: "2 due today" },
];

export function StatsBar() {
  return (
    <section
      className="stats-grid grid grid-cols-4 gap-6"
      aria-label="Statistics"
      style={{
        opacity: 0,
        animation: "fadeUp 0.7s var(--ease-out) 0.6s forwards",
      }}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="stat-card glass">
          <div className="stat-value">{stat.value}</div>
          <div className="stat-label">{stat.label}</div>
          <div className="stat-change stat-up">{stat.change}</div>
        </div>
      ))}
    </section>
  );
}
