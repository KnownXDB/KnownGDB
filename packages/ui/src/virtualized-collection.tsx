import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

type VirtualizedCollectionProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  label: string;
  className?: string;
  layout?: "list" | "grid";
  minItemWidthToken?: string;
  mobileMinItemWidthToken?: string;
  estimateRowSizeToken?: string;
  gapToken?: string;
  overscan?: number;
};

/** Virtualizes long page collections against the shared Workspace scroll area. */
export function VirtualizedCollection<T>({
  items,
  getKey,
  renderItem,
  label,
  className = "",
  layout = "list",
  minItemWidthToken = "--sys-layout-card-min",
  mobileMinItemWidthToken = minItemWidthToken,
  estimateRowSizeToken = "--sys-virtual-row-estimate",
  gapToken = "--sys-virtual-gap",
  overscan = 3,
}: VirtualizedCollectionProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [columns, setColumns] = useState(1);
  const tokenPixels = (token: string) => {
    const value = rootRef.current
      ? getComputedStyle(rootRef.current).getPropertyValue(token)
      : "";
    return Number.parseFloat(value) || 0;
  };
  const gap = tokenPixels(gapToken);

  useEffect(() => {
    const element = rootRef.current;
    const scroll =
      document.querySelector<HTMLElement>(
        ".workspace-scroll .simplebar-content-wrapper",
      ) ?? document.querySelector<HTMLElement>(".workspace-scroll");
    if (!element || !scroll) return;
    setScrollElement(scroll);
    const measure = () => {
      const rootRect = element.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      setScrollMargin(rootRect.top - scrollRect.top + scroll.scrollTop);
      if (layout === "grid") {
        const width = element.clientWidth;
        const mobile = window.matchMedia("(max-width: 800px)").matches;
        const itemToken = mobile ? mobileMinItemWidthToken : minItemWidthToken;
        const itemWidth = tokenPixels(itemToken);
        setColumns(Math.max(1, Math.floor((width + gap) / (itemWidth + gap))));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [gap, gapToken, layout, minItemWidthToken, mobileMinItemWidthToken]);

  const rowCount =
    layout === "grid" ? Math.ceil(items.length / columns) : items.length;
  const rowKeys = useMemo(
    () =>
      Array.from({ length: rowCount }, (_, row) =>
        layout === "grid"
          ? items
              .slice(row * columns, (row + 1) * columns)
              .map(getKey)
              .join("|")
          : getKey(items[row]),
      ),
    [columns, getKey, items, layout, rowCount],
  );
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElement,
    getItemKey: (index) => rowKeys[index] ?? index,
    estimateSize: () => tokenPixels(estimateRowSizeToken),
    overscan,
    scrollMargin,
  });

  return (
    <div
      ref={rootRef}
      className={`virtualized-collection ${className}`.trim()}
      role="list"
      aria-label={label}
      style={
        {
          display: "block",
          height: virtualizer.getTotalSize(),
          "--virtualized-gap": `var(${gapToken})`,
        } as CSSProperties
      }
    >
      {virtualizer.getVirtualItems().map((row) => {
        const start = row.index * (layout === "grid" ? columns : 1);
        const rowItems = items.slice(
          start,
          layout === "grid" ? start + columns : start + 1,
        );
        return (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            className={`virtualized-collection-row${layout === "grid" ? " is-grid" : ""}`}
            role="presentation"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${row.start - scrollMargin}px)`,
              ...(layout === "grid"
                ? {
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    columnGap: "var(--virtualized-gap)",
                    paddingBottom: "var(--virtualized-gap)",
                  }
                : { paddingBottom: "var(--virtualized-gap)" }),
            }}
          >
            {rowItems.map((item) => (
              <div
                key={getKey(item)}
                className="virtualized-collection-item"
                role="listitem"
              >
                {renderItem(item)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
