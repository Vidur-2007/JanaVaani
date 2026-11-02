// Shared components (master §11). Only Laptop A edits these originals; wrap them in your own folder to extend.
export { PriorityChip, StatusChip, DepartmentBadge, LangBadge, AIBadge, DEPARTMENT_ICONS } from './chips';
export type { PriorityChipProps, DepartmentBadgeProps, AIBadgeProps } from './chips';
export { KPIStat, Timeline, SLACountdown, BeforeAfterSlider, useCountUp } from './data';
export type { KPIStatProps, TimelineProps, SLACountdownProps, BeforeAfterSliderProps } from './data';
export { EmptyState, ErrorState, LiveIndicator } from './states';
export type { EmptyStateProps, ErrorStateProps } from './states';
export { Skeleton, TextSkeleton, CardSkeleton, ListSkeleton, StatSkeleton, PageSkeleton, RouteFallback } from './Skeletons';
export { MapView, HYDERABAD } from './MapView';
export type { MapViewProps } from './MapView';
export {
  ListenButton,
  LanguageSwitcher,
  ThemeToggle,
  PageTransition,
  AnimatePresence,
  Logo,
} from './controls';
export type { ListenButtonProps, LanguageSwitcherProps } from './controls';
export { Confetti } from './Confetti';
