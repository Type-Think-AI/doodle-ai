// Static dummy data for the admin UI (Phase 1 — no real functionality).

export const USERS = [
	{ name: 'Sana Iyer', email: 'sana.iyer@gmail.com', plan: 'Pro', credits: 2210, doodles: 512, projects: 6, signup: 'May 30, 2025', active: '6h ago', country: 'India', topSkill: 'Freeform Scribble' },
	{ name: 'Mimo Reyes', email: 'mimo@doodleai.art', plan: 'Pro', credits: 1840, doodles: 318, projects: 4, signup: 'Sep 3, 2025', active: '14m ago', country: 'Mexico', topSkill: 'Journal Stickers' },
	{ name: 'Lin Zhao', email: 'lin.z@studio.io', plan: 'Pro', credits: 920, doodles: 204, projects: 5, signup: 'Nov 8, 2025', active: '3h ago', country: 'Singapore', topSkill: 'Clay Character' },
	{ name: 'June Park', email: 'june.park@gmail.com', plan: 'Pro', credits: 610, doodles: 138, projects: 3, signup: 'Oct 14, 2025', active: '5h ago', country: 'South Korea', topSkill: 'Doodle Avatar' },
	{ name: 'Yash Patidar', email: 'yhpatidar1999@gmail.com', plan: 'Free', credits: 236, doodles: 42, projects: 2, signup: 'Jan 12, 2026', active: '2m ago', country: 'India', topSkill: 'Doodle Avatar' },
	{ name: 'Rin Osei', email: 'rin.o@sketch.app', plan: 'Free', credits: 44, doodles: 17, projects: 1, signup: 'Dec 19, 2025', active: '2d ago', country: 'Ghana', topSkill: 'Black & White' },
	{ name: 'Tara Singh', email: 'tara.s@gmail.com', plan: 'Free', credits: 18, doodles: 9, projects: 1, signup: 'Jul 21, 2025', active: '1h ago', country: 'UK', topSkill: 'Day Strip' },
	{ name: 'Vin Cole', email: 'vin@printhouse.co', plan: 'Free', credits: 6, doodles: 3, projects: 1, signup: 'Feb 2, 2026', active: '1d ago', country: 'Canada', topSkill: 'Zine Cover' },
];

export const PROJECTS = [
	{ name: 'Brand mascot explorations', owner: 'Sana Iyer', type: 'Team', doodles: 112, created: 'Jun 1, 2025' },
	{ name: 'Weekend sketch pack', owner: 'Mimo Reyes', type: 'Solo', doodles: 64, created: 'Sep 4, 2025' },
	{ name: 'Journal covers 2026', owner: 'Lin Zhao', type: 'Team', doodles: 38, created: 'Nov 9, 2025' },
	{ name: 'Diary strips', owner: 'Yash Patidar', type: 'Solo', doodles: 29, created: 'Jan 13, 2026' },
	{ name: 'Team avatars', owner: 'June Park', type: 'Team', doodles: 21, created: 'Oct 16, 2025' },
	{ name: 'Sticker drops', owner: 'Rin Osei', type: 'Solo', doodles: 17, created: 'Dec 20, 2025' },
	{ name: 'Zine vol. 3', owner: 'Vin Cole', type: 'Solo', doodles: 14, created: 'Feb 3, 2026' },
	{ name: 'Client onboarding kit', owner: 'Tara Singh', type: 'Team', doodles: 9, created: 'Jul 22, 2025' },
];

export const SKILLS = [
	{ name: 'Freeform Scribble', seed: 'freeform', runs: '21.0k', successRate: 97, creators: '1.2k', status: 'Featured' },
	{ name: 'Doodle Avatar', seed: 'avatar', runs: '12.4k', successRate: 98, creators: '538', status: 'Live' },
	{ name: 'Journal Stickers', seed: 'stickers', runs: '9.1k', successRate: 95, creators: '412', status: 'Live' },
	{ name: 'Black & White Doodle', seed: 'bw', runs: '6.8k', successRate: 99, creators: '340', status: 'Live' },
	{ name: 'Click-My-Day Strip', seed: 'daystrip', runs: '5.2k', successRate: 91, creators: '268', status: 'Paused' },
	{ name: 'Doodle Zine Cover', seed: 'zine', runs: '3.4k', successRate: 93, creators: '106', status: 'Live' },
];

export const INVOICES = [
	{ id: 'INV-2481', customer: 'Sana Iyer', date: 'Feb 4, 2026', amount: '$29.00', status: 'Paid' },
	{ id: 'INV-2480', customer: 'Mimo Reyes', date: 'Feb 4, 2026', amount: '$29.00', status: 'Paid' },
	{ id: 'INV-2477', customer: 'Lin Zhao', date: 'Feb 3, 2026', amount: '$99.00', status: 'Paid' },
	{ id: 'INV-2471', customer: 'June Park', date: 'Feb 2, 2026', amount: '$29.00', status: 'Failed' },
	{ id: 'INV-2465', customer: 'Ana Duarte', date: 'Feb 1, 2026', amount: '$99.00', status: 'Paid' },
	{ id: 'INV-2460', customer: 'Kito Mensah', date: 'Jan 31, 2026', amount: '$29.00', status: 'Refunded' },
];

export const ARTICLES = [
	{ title: 'How AI doodle avatars are changing profile pictures', status: 'Published', views: '12.4k', rank: '#3', signups: '184' },
	{ title: 'Turn any selfie into a sticker sheet — full guide', status: 'Published', views: '8.1k', rank: '#5', signups: '126' },
	{ title: '7 skills every doodle creator should try', status: 'Published', views: '6.9k', rank: '#9', signups: '88' },
	{ title: 'Inside the Freeform Scribble skill', status: 'Published', views: '4.2k', rank: '#14', signups: '41' },
	{ title: 'Building a diary comic from your camera roll', status: 'Draft', views: '—', rank: '—', signups: '—' },
	{ title: 'Riso zine covers, made in seconds', status: 'Scheduled', views: '—', rank: '—', signups: '—' },
];

export const SERIES = {
	growth: [40, 52, 48, 60, 55, 70, 64, 80, 74, 90, 86, 96, 92, 100],
	finance: [60, 58, 66, 64, 72, 70, 80, 78, 88, 84, 94, 92, 100, 98],
	usage: [72, 66, 80, 74, 88, 70, 92, 84, 96, 78, 100, 88, 94, 86],
};

export const NAV = [
	{
		group: 'Monitor',
		items: [{ key: 'overview', label: 'Overview', href: '/admin' }],
	},
	{
		group: 'People',
		items: [
			{ key: 'users', label: 'Users', href: '/admin/users', badge: '4.8k' },
			{ key: 'projects', label: 'Projects', href: '/admin/projects' },
		],
	},
	{
		group: 'Platform',
		items: [
			{ key: 'skills', label: 'Skills', href: '/admin/skills' },
			{ key: 'credits', label: 'Credits', href: '/admin/credits' },
		],
	},
	{
		group: 'Business',
		items: [
			{ key: 'billing', label: 'Billing', href: '/admin/billing' },
			{ key: 'marketing', label: 'Marketing', href: '/admin/marketing', badge: '3' },
		],
	},
];

export const PAGE_COPY: Record<string, { title: string; subtitle: string }> = {
	overview: { title: 'Overview', subtitle: 'Growth, usage, and platform health at a glance.' },
	users: { title: 'Users', subtitle: 'Everyone who has signed up to Doodle AI.' },
	projects: { title: 'Projects', subtitle: 'Every project created across all users.' },
	skills: { title: 'Skills', subtitle: 'AI doodle skills available on the platform.' },
	credits: { title: 'Credits', subtitle: 'Issued vs. used credits, and manual grants.' },
	billing: { title: 'Billing', subtitle: 'Subscriptions, invoices, and revenue.' },
	marketing: { title: 'Marketing', subtitle: 'Articles, SEO performance, and campaigns.' },
};

export const DONUT_DATA = [
	{ name: 'Freeform Scribble', pct: 31, color: 'var(--accent)' },
	{ name: 'Doodle Avatar', pct: 26, color: 'var(--blue)' },
	{ name: 'Journal Stickers', pct: 21, color: 'var(--green)' },
	{ name: 'Everything else', pct: 22, color: 'var(--border3)' },
];

export const FUNNEL_DATA = [
	{ label: 'Signed up', value: '4,812', pct: '100%', w: 100, color: 'var(--accent)' },
	{ label: 'Made first doodle', value: '3,940', pct: '82%', w: 82, color: 'var(--blue)', drop: '872 never generated' },
	{ label: 'Upgraded to Pro', value: '312', pct: '6.5%', w: 14, color: 'var(--muted2)', drop: '1,868 stalled before paying' },
];

const CREDIT_ISSUED = [42, 38, 50, 46, 58, 52, 64, 60, 72, 68];
const CREDIT_USED = [30, 33, 38, 41, 44, 47, 52, 55, 60, 63];
const CREDIT_BAR_W = 20;
const CREDIT_BAR_GAP = 8;
const CREDIT_MAX_BAR = 80;
const CREDIT_CHART_H = 130;

export const CREDIT_BARS = CREDIT_ISSUED.map((issued, i) => {
	const used = CREDIT_USED[i];
	const hIssued = (issued / CREDIT_MAX_BAR) * CREDIT_CHART_H;
	const hUsed = (used / CREDIT_MAX_BAR) * CREDIT_CHART_H;
	return {
		x: i * (CREDIT_BAR_W + CREDIT_BAR_GAP) + 6,
		w: CREDIT_BAR_W,
		hIssued: Math.round(hIssued),
		yIssued: Math.round(CREDIT_CHART_H - hIssued),
		hUsed: Math.round(hUsed),
		yUsed: Math.round(CREDIT_CHART_H - hUsed),
		issued,
		used,
	};
});

export const LEDGER = [
	{ sign: '+', text: 'Granted 500 credits to Mimo Reyes', amount: '+500', who: 'You · 5m ago' },
	{ sign: '−', text: 'Sana Iyer ran Freeform Scribble ×4', amount: '−12', who: 'System · 18m ago' },
	{ sign: '+', text: 'Welcome bonus to Rin Osei', amount: '+50', who: 'Automation · 1h ago' },
	{ sign: '−', text: 'Yash Patidar ran Doodle Avatar', amount: '−4', who: 'System · 2h ago' },
	{ sign: '+', text: 'Granted 1,000 credits to Lin Zhao', amount: '+1000', who: 'You · 4h ago' },
	{ sign: '−', text: 'June Park ran Journal Stickers ×2', amount: '−8', who: 'System · 5h ago' },
	{ sign: '+', text: 'Refund credit to Vin Cole', amount: '+120', who: 'Support · 1d ago' },
];

export const CREDIT_PRESETS = [50, 100, 500, 1000];

export function polyline(vals: number[], w: number, h: number, pad: number) {
	const max = Math.max(...vals);
	const min = Math.min(...vals);
	return vals
		.map((v, i) => {
			const x = pad + (i * (w - pad * 2)) / (vals.length - 1);
			const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(' ');
}
