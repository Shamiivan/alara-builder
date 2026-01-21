# 06 - UI Design

This document defines the component hierarchy, layout structure, properties panel design, and interaction patterns for Alara's visual editor interface.

---

## Current Implementation: `@alara/client` (Vanilla JS)

The current implementation uses a minimal vanilla JavaScript client (`@alara/client`) that is injected into the user's running Vite app. This client provides:

- **Selection overlays** - Blue outline around selected element, dashed hover indicator
- **Text editing** - Double-click to edit text inline via `contentEditable`
- **Connection status** - Visual indicator when disconnected from Alara service
- **WebSocket communication** - Sends transform requests to the service

The client has **no React dependency** and renders overlays via direct DOM manipulation. For the current client implementation, see [02-MODULE-DESIGN.md Section 3](./02-MODULE-DESIGN.md#3-client-package-alaraclient).

## Future Phases: FloatingToolbox & Advanced UI

The sections below describe the **planned** full visual editor UI with FloatingToolbox panels, toolbar controls, and property editors. These features will be implemented in future phases and may use React or remain vanilla JS depending on requirements.

---

## 1. Overall Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TOOLBAR (48px)                                  │
│  [Logo] [Undo] [Redo] │ [Desktop] [Tablet] [Mobile] │ [Zoom] │ [Preview]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                            CANVAS (100%)                                    │
│                                                                             │
│    ┌─────────────────────────────────────────────┐                          │
│    │ [Layout] [Spacing] [Colors] [Typography]   │ ◄─ FloatingToolbox       │
│    ├─────────────────────────────────────────────┤                          │
│    │          Tab content panel                  │                          │
│    └─────────────────────────────────────────────┘                          │
│                          ▼                                                  │
│    ┌──────────────────────────────────────────────┐                         │
│    │                                              │                         │
│    │           User's Website Content            │                         │
│    │                                              │                         │
│    │    ┌─────────────────┐                      │                         │
│    │    │ Selected Element │◄── Selection        │                         │
│    │    │                 │     Overlay          │                         │
│    │    └─────────────────┘                      │                         │
│    │                                              │                         │
│    └──────────────────────────────────────────────┘                         │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                            STATUS BAR (24px)                                 │
│  [● Connected] │ [2 pending...] │ [src/components/Button.tsx:42]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Layout Specifications

| Region | Width/Height | Behavior |
|--------|--------------|----------|
| Toolbar | 100% × 48px | Fixed top |
| Canvas | 100% | Scrollable, zoomable |
| FloatingToolbox | auto × auto | Positioned near selection via Floating UI |
| Status Bar | 100% × 24px | Fixed bottom |

### 1.2 CSS Module Structure

```
builder/
├── styles/
│   ├── tokens.module.css      # Design tokens (colors, spacing, typography)
│   ├── globals.module.css     # Reset and base styles
│   └── layout.module.css      # Main layout grid
├── components/
│   ├── App/
│   │   ├── App.tsx
│   │   └── App.module.css
│   ├── Toolbar/
│   ├── Canvas/
│   ├── FloatingToolbox/
│   └── StatusBar/
```

---

## 2. Component Hierarchy

```
App
├── Toolbar
│   ├── Logo
│   ├── HistoryControls
│   │   ├── UndoButton
│   │   └── RedoButton
│   ├── DeviceSelector
│   │   ├── DesktopButton
│   │   ├── TabletButton
│   │   └── MobileButton
│   ├── ZoomControls
│   │   ├── ZoomOutButton
│   │   ├── ZoomDisplay
│   │   └── ZoomInButton
│   └── PreviewToggle
│
├── Canvas (100% width)
│   ├── DeviceFrame
│   │   └── UserAppRoot (portal target)
│   ├── HoverOverlay
│   ├── SelectionOverlay
│   │   ├── SelectionBox
│   │   ├── ResizeHandles (future)
│   │   ├── ElementLabel
│   │   └── FloatingToolbox        ← positioned via Floating UI
│   │       ├── TabBar
│   │       │   └── TabButton (per tab)
│   │       └── TabContent
│   │           ├── LayoutPanel
│   │           ├── SpacingPanel
│   │           ├── ColorsPanel
│   │           ├── TypographyPanel
│   │           ├── BorderPanel
│   │           └── EffectsPanel
│   └── TextEditOverlay
│
└── StatusBar
    ├── ConnectionStatus
    ├── PendingEditsIndicator
    ├── CurrentFileIndicator
    └── ErrorBadge
```

---

## 3. Toolbar Design

### 3.1 Toolbar Component

```typescript
// builder/components/Toolbar/Toolbar.tsx
interface ToolbarProps {
  className?: string;
}

export function Toolbar({ className }: ToolbarProps) {
  return (
    <header className={clsx(styles.toolbar, className)}>
      <div className={styles.left}>
        <Logo />
        <Divider />
        <HistoryControls />
      </div>

      <div className={styles.center}>
        <DeviceSelector />
      </div>

      <div className={styles.right}>
        <ZoomControls />
        <Divider />
        <PreviewToggle />
      </div>
    </header>
  );
}
```

### 3.2 Toolbar Styles

```css
/* Toolbar.module.css */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.left,
.center,
.right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}
```

### 3.3 Device Selector

```typescript
// builder/components/Toolbar/DeviceSelector.tsx
type DeviceMode = 'desktop' | 'tablet' | 'mobile';

const DEVICE_CONFIGS: Record<DeviceMode, { icon: IconType; width: string; label: string }> = {
  desktop: { icon: MonitorIcon, width: '100%', label: 'Desktop' },
  tablet: { icon: TabletIcon, width: '768px', label: 'Tablet (768px)' },
  mobile: { icon: PhoneIcon, width: '375px', label: 'Mobile (375px)' },
};

export function DeviceSelector() {
  const deviceMode = useEditorStore(state => state.deviceMode);
  const setDeviceMode = useEditorStore(state => state.setDeviceMode);

  return (
    <div className={styles.deviceSelector} role="radiogroup" aria-label="Device preview">
      {Object.entries(DEVICE_CONFIGS).map(([mode, config]) => (
        <button
          key={mode}
          className={clsx(styles.deviceButton, {
            [styles.active]: deviceMode === mode,
          })}
          onClick={() => setDeviceMode(mode as DeviceMode)}
          aria-checked={deviceMode === mode}
          role="radio"
          title={config.label}
        >
          <config.icon size={18} />
        </button>
      ))}
    </div>
  );
}
```

### 3.4 Zoom Controls

```typescript
// builder/components/Toolbar/ZoomControls.tsx
const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200];

export function ZoomControls() {
  const zoom = useEditorStore(state => state.zoom);
  const setZoom = useEditorStore(state => state.setZoom);

  const zoomIn = () => {
    const nextStep = ZOOM_STEPS.find(z => z > zoom) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
    setZoom(nextStep);
  };

  const zoomOut = () => {
    const prevStep = [...ZOOM_STEPS].reverse().find(z => z < zoom) ?? ZOOM_STEPS[0];
    setZoom(prevStep);
  };

  return (
    <div className={styles.zoomControls}>
      <IconButton
        icon={MinusIcon}
        onClick={zoomOut}
        disabled={zoom <= ZOOM_STEPS[0]}
        aria-label="Zoom out"
      />
      <span className={styles.zoomDisplay}>{zoom}%</span>
      <IconButton
        icon={PlusIcon}
        onClick={zoomIn}
        disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
        aria-label="Zoom in"
      />
    </div>
  );
}
```

---

## 4. Canvas Design

### 4.1 Canvas Component

```typescript
// builder/components/Canvas/Canvas.tsx
interface CanvasProps {
  children: React.ReactNode;
}

export function Canvas({ children }: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const {
    zoom,
    deviceMode,
    previewMode,
    selectedElement,
    hoveredElement,
  } = useEditorStore();

  const deviceWidth = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px',
  }[deviceMode];

  // Handle element selection on click
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (previewMode) return;
    e.stopPropagation();

    const target = e.target as HTMLElement;
    const alaraElement = target.closest('[oid][css]') as HTMLElement;

    if (alaraElement) {
      const elementTarget = getElementTarget(alaraElement);
      if (elementTarget) {
        useEditorStore.getState().selectElement(target, elementTarget);
      }
    } else {
      useEditorStore.getState().clearSelection();
    }
  }, [previewMode]);

  // Handle hover
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (previewMode) return;

    const target = e.target as HTMLElement;
    const alaraElement = target.closest('[oid][css]') as HTMLElement;

    if (alaraElement && alaraElement !== selectedElement?.domElement) {
      const bounds = alaraElement.getBoundingClientRect();
      const elementTarget = getElementTarget(alaraElement);
      if (elementTarget) {
        useEditorStore.getState().hoverElement(elementTarget, bounds);
      }
    }
  }, [previewMode, selectedElement]);

  return (
    <div
      ref={canvasRef}
      className={styles.canvas}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => useEditorStore.getState().clearHover()}
    >
      {/* Zoom container */}
      <div
        className={styles.zoomContainer}
        style={{
          transform: `scale(${zoom / 100})`,
          transformOrigin: 'top center',
        }}
      >
        {/* Device frame */}
        <div
          className={clsx(styles.deviceFrame, styles[deviceMode])}
          style={{ width: deviceWidth }}
        >
          {children}
        </div>
      </div>

      {/* Overlays (outside zoom to maintain crisp lines) */}
      {!previewMode && (
        <OverlayLayer canvasRef={canvasRef} zoom={zoom}>
          {hoveredElement && !selectedElement && (
            <HoverOverlay bounds={hoveredElement.bounds} />
          )}
          {selectedElement && (
            <SelectionOverlay
              element={selectedElement}
              onStartTextEdit={() => useEditorStore.getState().startTextEditing(selectedElement.target)}
            />
          )}
        </OverlayLayer>
      )}
    </div>
  );
}
```

### 4.2 Canvas Styles

```css
/* Canvas.module.css */
.canvas {
  flex: 1;
  overflow: auto;
  background: var(--color-canvas-bg);
  background-image:
    radial-gradient(circle, var(--color-canvas-dot) 1px, transparent 1px);
  background-size: 20px 20px;
  position: relative;
}

.zoomContainer {
  display: flex;
  justify-content: center;
  padding: 40px;
  min-height: 100%;
}

.deviceFrame {
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
  border-radius: 8px;
  overflow: hidden;
  transition: width 0.3s ease;
}

.deviceFrame.desktop {
  max-width: 1440px;
}

.deviceFrame.tablet {
  max-width: 768px;
}

.deviceFrame.mobile {
  max-width: 375px;
}
```

### 4.3 Selection Overlay

```typescript
// builder/components/Canvas/SelectionOverlay.tsx
interface SelectionOverlayProps {
  element: SelectedElement;
  onStartTextEdit: () => void;
}

export function SelectionOverlay({ element, onStartTextEdit }: SelectionOverlayProps) {
  const { bounds, target } = element;

  // Double-click to edit text
  const handleDoubleClick = useCallback(() => {
    const hasTextContent = element.domElement.childNodes.length === 1 &&
      element.domElement.firstChild?.nodeType === Node.TEXT_NODE;

    if (hasTextContent) {
      onStartTextEdit();
    }
  }, [element, onStartTextEdit]);

  return (
    <div
      className={styles.selectionOverlay}
      style={{
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Selection border */}
      <div className={styles.selectionBorder} />

      {/* Element label */}
      <div className={styles.elementLabel}>
        <span className={styles.tagName}>
          {element.domElement.tagName.toLowerCase()}
        </span>
        {target.selector && (
          <span className={styles.className}>.{target.selector}</span>
        )}
      </div>

      {/* Resize handles (future feature) */}
      {/* <ResizeHandles /> */}
    </div>
  );
}
```

### 4.4 Selection Overlay Styles

```css
/* SelectionOverlay.module.css */
.selectionOverlay {
  position: absolute;
  pointer-events: none;
  z-index: 1000;
}

.selectionBorder {
  position: absolute;
  inset: 0;
  border: 2px solid var(--color-primary);
  border-radius: 2px;
}

.elementLabel {
  position: absolute;
  top: -24px;
  left: -2px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--color-primary);
  color: white;
  font-size: 12px;
  font-family: var(--font-mono);
  border-radius: 4px 4px 0 0;
  white-space: nowrap;
}

.tagName {
  font-weight: 600;
}

.className {
  opacity: 0.8;
}
```

### 4.5 Hover Overlay

```typescript
// builder/components/Canvas/HoverOverlay.tsx
interface HoverOverlayProps {
  bounds: DOMRect;
}

export function HoverOverlay({ bounds }: HoverOverlayProps) {
  return (
    <div
      className={styles.hoverOverlay}
      style={{
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      }}
    />
  );
}
```

```css
/* HoverOverlay.module.css */
.hoverOverlay {
  position: absolute;
  border: 1px dashed var(--color-primary);
  background: var(--color-primary-alpha);
  pointer-events: none;
  z-index: 999;
}
```

---

## 5. FloatingToolbox Design

The FloatingToolbox is a context-sensitive editing panel that appears near the selected element. It uses **Floating UI** (`@floating-ui/react`) for robust positioning with automatic scroll/resize handling.

### 5.1 Toolbox Structure

```typescript
// builder/components/FloatingToolbox/FloatingToolbox.tsx
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
} from '@floating-ui/react';

interface FloatingToolboxProps {
  element: SelectedElement;
  referenceElement: HTMLElement | null;
  activeTab: ToolboxTabId;
  onTabChange: (tab: ToolboxTabId) => void;
}

type ToolboxTabId = 'layout' | 'spacing' | 'colors' | 'typography' | 'border' | 'effects' | 'format';

export function FloatingToolbox({
  element,
  referenceElement,
  activeTab,
  onTabChange,
}: FloatingToolboxProps) {
  const { refs, floatingStyles, placement } = useFloating({
    placement: 'top',
    middleware: [
      offset(12),
      flip({
        fallbackPlacements: ['bottom'],
        padding: 80, // Account for toolbar height
      }),
      shift({
        padding: 12,
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  // Sync reference element from selection
  useLayoutEffect(() => {
    refs.setReference(referenceElement);
  }, [referenceElement, refs]);

  if (!referenceElement) return null;

  const tabs = getTabsForElement(element);

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className={styles.toolbox}
      data-placement={placement}
    >
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
      <TabContent
        activeTab={activeTab}
        element={element}
      />
    </div>
  );
}
```

### 5.2 Toolbox Styles

```css
/* FloatingToolbox.module.css */
.toolbox {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  min-width: 280px;
  max-width: 360px;
  z-index: 1000;
}

.toolbox[data-placement="bottom"] {
  /* Arrow points up when toolbox is below element */
}

.toolbox[data-placement="top"] {
  /* Arrow points down when toolbox is above element */
}
```

### 5.3 Tab Bar

```typescript
// builder/components/FloatingToolbox/TabBar.tsx
interface TabBarProps {
  tabs: ToolboxTabConfig[];
  activeTab: ToolboxTabId;
  onTabChange: (tab: ToolboxTabId) => void;
}

interface ToolboxTabConfig {
  id: ToolboxTabId;
  label: string;
  icon: IconType;
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div className={styles.tabBar} role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={clsx(styles.tab, { [styles.active]: activeTab === tab.id })}
          onClick={() => onTabChange(tab.id)}
        >
          <tab.icon size={16} />
          <span className={styles.tabLabel}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
```

```css
/* TabBar.module.css */
.tabBar {
  display: flex;
  gap: 2px;
  padding: 4px;
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-muted);
  font-size: 13px;
  white-space: nowrap;
}

.tab:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.tab.active {
  background: var(--color-primary-alpha);
  color: var(--color-primary);
}

.tabLabel {
  /* Hidden on small toolbox, shown on wider */
}
```

### 5.4 Tab Configurations by Element Type

```typescript
// builder/components/FloatingToolbox/tabConfigs.ts
const TEXT_TABS: ToolboxTabConfig[] = [
  { id: 'format', label: 'Format', icon: TypeIcon },
  { id: 'colors', label: 'Colors', icon: PaletteIcon },
  { id: 'typography', label: 'Typography', icon: TextIcon },
  { id: 'spacing', label: 'Spacing', icon: SpaceIcon },
  { id: 'effects', label: 'Effects', icon: SparklesIcon },
];

const CONTAINER_TABS: ToolboxTabConfig[] = [
  { id: 'layout', label: 'Layout', icon: LayoutIcon },
  { id: 'spacing', label: 'Spacing', icon: SpaceIcon },
  { id: 'colors', label: 'Colors', icon: PaletteIcon },
  { id: 'border', label: 'Border', icon: BorderIcon },
  { id: 'effects', label: 'Effects', icon: SparklesIcon },
];

const IMAGE_TABS: ToolboxTabConfig[] = [
  { id: 'layout', label: 'Size', icon: ImageIcon },
  { id: 'spacing', label: 'Position', icon: MoveIcon },
  { id: 'border', label: 'Border', icon: BorderIcon },
  { id: 'effects', label: 'Effects', icon: SparklesIcon },
];

const DEFAULT_TABS: ToolboxTabConfig[] = [
  { id: 'spacing', label: 'Spacing', icon: SpaceIcon },
  { id: 'colors', label: 'Colors', icon: PaletteIcon },
  { id: 'effects', label: 'Effects', icon: SparklesIcon },
];

export function getTabsForElement(element: SelectedElement): ToolboxTabConfig[] {
  const tagName = element.domElement.tagName.toLowerCase();

  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'label'].includes(tagName)) {
    return TEXT_TABS;
  }

  if (['div', 'section', 'article', 'main', 'aside', 'nav', 'header', 'footer'].includes(tagName)) {
    return CONTAINER_TABS;
  }

  if (tagName === 'img') {
    return IMAGE_TABS;
  }

  return DEFAULT_TABS;
}
```

### 5.5 Tab Content Panel

```typescript
// builder/components/FloatingToolbox/TabContent.tsx
interface TabContentProps {
  activeTab: ToolboxTabId;
  element: SelectedElement;
}

export function TabContent({ activeTab, element }: TabContentProps) {
  return (
    <div className={styles.content} role="tabpanel">
      {activeTab === 'layout' && <LayoutPanel element={element} />}
      {activeTab === 'spacing' && <SpacingPanel element={element} />}
      {activeTab === 'colors' && <ColorsPanel element={element} />}
      {activeTab === 'typography' && <TypographyPanel element={element} />}
      {activeTab === 'border' && <BorderPanel element={element} />}
      {activeTab === 'effects' && <EffectsPanel element={element} />}
      {activeTab === 'format' && <FormatPanel element={element} />}
    </div>
  );
}
```

```css
/* TabContent.module.css */
.content {
  padding: 12px;
  max-height: 300px;
  overflow-y: auto;
}
```

### 5.6 Why Floating UI

Floating UI provides several benefits over a custom positioning algorithm:

1. **Auto-update** - Automatically repositions on scroll, resize, and layout changes via `whileElementsMounted: autoUpdate`
2. **Flip middleware** - Repositions below element when near viewport top
3. **Shift middleware** - Keeps toolbox within canvas bounds
4. **No manual calculations** - No `getBoundingClientRect` or scroll offset math
5. **Battle-tested** - Used by Radix UI, Headless UI, and other production libraries

---

## 6. Property Control Components

These components are rendered inside FloatingToolbox tab panels. Each panel is displayed when its corresponding tab is active.

### 6.1 Spacing Panel

```typescript
// builder/components/FloatingToolbox/panels/SpacingPanel.tsx
export function SpacingPanel({ element }: PanelProps) {
  const updateStyle = useEditorStore(state => state.updateStyle);
  const styles = element.computedStyles;

  return (
    <div className={styles.panel}>
      <SpacingControl
        label="Margin"
        values={{
          top: styles.marginTop,
          right: styles.marginRight,
          bottom: styles.marginBottom,
          left: styles.marginLeft,
        }}
        onChange={(side, value) => updateStyle(`margin-${side}`, value)}
      />

      <SpacingControl
        label="Padding"
        values={{
          top: styles.paddingTop,
          right: styles.paddingRight,
          bottom: styles.paddingBottom,
          left: styles.paddingLeft,
        }}
        onChange={(side, value) => updateStyle(`padding-${side}`, value)}
      />
    </div>
  );
}
```

### 6.2 Spacing Control (Box Model)

```typescript
// builder/components/FloatingToolbox/controls/SpacingControl.tsx
interface SpacingControlProps {
  label: string;
  values: { top: string; right: string; bottom: string; left: string };
  onChange: (side: 'top' | 'right' | 'bottom' | 'left', value: string) => void;
}

export function SpacingControl({ label, values, onChange }: SpacingControlProps) {
  const [linked, setLinked] = useState(false);

  const handleChange = (side: keyof typeof values, value: string) => {
    if (linked) {
      // Update all sides
      onChange('top', value);
      onChange('right', value);
      onChange('bottom', value);
      onChange('left', value);
    } else {
      onChange(side, value);
    }
  };

  return (
    <div className={styles.spacingControl}>
      <div className={styles.label}>
        <span>{label}</span>
        <IconButton
          icon={linked ? LinkIcon : UnlinkIcon}
          size="small"
          onClick={() => setLinked(!linked)}
          aria-label={linked ? 'Unlink values' : 'Link values'}
        />
      </div>

      <div className={styles.boxModel}>
        {/* Top */}
        <div className={styles.top}>
          <UnitInput
            value={values.top}
            onChange={(v) => handleChange('top', v)}
            placeholder="0"
          />
        </div>

        {/* Middle row: Left, Center, Right */}
        <div className={styles.middle}>
          <UnitInput
            value={values.left}
            onChange={(v) => handleChange('left', v)}
            placeholder="0"
          />
          <div className={styles.center} />
          <UnitInput
            value={values.right}
            onChange={(v) => handleChange('right', v)}
            placeholder="0"
          />
        </div>

        {/* Bottom */}
        <div className={styles.bottom}>
          <UnitInput
            value={values.bottom}
            onChange={(v) => handleChange('bottom', v)}
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );
}
```

### 6.3 Layout Panel

```typescript
// builder/components/FloatingToolbox/panels/LayoutPanel.tsx
export function LayoutPanel({ element }: PanelProps) {
  const updateStyle = useEditorStore(state => state.updateStyle);
  const styles = element.computedStyles;

  return (
    <div className={styles.panel}>
      <PropertyRow label="Display">
        <SegmentedControl
          value={styles.display}
          options={[
            { value: 'block', icon: SquareIcon },
            { value: 'flex', icon: FlexIcon },
            { value: 'grid', icon: GridIcon },
            { value: 'inline', icon: InlineIcon },
            { value: 'none', icon: EyeOffIcon },
          ]}
          onChange={(v) => updateStyle('display', v)}
        />
      </PropertyRow>

      {styles.display === 'flex' && (
        <>
          <PropertyRow label="Direction">
            <SegmentedControl
              value={styles.flexDirection}
              options={[
                { value: 'row', icon: ArrowRightIcon, label: 'Row' },
                { value: 'column', icon: ArrowDownIcon, label: 'Column' },
              ]}
              onChange={(v) => updateStyle('flex-direction', v)}
            />
          </PropertyRow>

          <PropertyRow label="Justify">
            <SegmentedControl
              value={styles.justifyContent}
              options={[
                { value: 'flex-start', icon: AlignLeftIcon },
                { value: 'center', icon: AlignCenterIcon },
                { value: 'flex-end', icon: AlignRightIcon },
                { value: 'space-between', icon: SpaceBetweenIcon },
                { value: 'space-around', icon: SpaceAroundIcon },
              ]}
              onChange={(v) => updateStyle('justify-content', v)}
            />
          </PropertyRow>

          <PropertyRow label="Align">
            <SegmentedControl
              value={styles.alignItems}
              options={[
                { value: 'flex-start', icon: AlignTopIcon },
                { value: 'center', icon: AlignMiddleIcon },
                { value: 'flex-end', icon: AlignBottomIcon },
                { value: 'stretch', icon: StretchIcon },
              ]}
              onChange={(v) => updateStyle('align-items', v)}
            />
          </PropertyRow>

          <PropertyRow label="Gap">
            <UnitInput
              value={styles.gap}
              onChange={(v) => updateStyle('gap', v)}
            />
          </PropertyRow>
        </>
      )}
    </div>
  );
}
```

### 6.4 Colors Panel

```typescript
// builder/components/FloatingToolbox/panels/ColorsPanel.tsx
export function ColorsPanel({ element }: PanelProps) {
  const updateStyle = useEditorStore(state => state.updateStyle);
  const styles = element.computedStyles;

  return (
    <div className={styles.panel}>
      <PropertyRow label="Text">
        <ColorPicker
          value={styles.color}
          onChange={(v) => updateStyle('color', v)}
        />
      </PropertyRow>

      <PropertyRow label="Background">
        <ColorPicker
          value={styles.backgroundColor}
          onChange={(v) => updateStyle('background-color', v)}
        />
      </PropertyRow>

      <PropertyRow label="Opacity">
        <Slider
          value={parseFloat(styles.opacity) * 100}
          min={0}
          max={100}
          step={1}
          onChange={(v) => updateStyle('opacity', String(v / 100))}
          suffix="%"
        />
      </PropertyRow>
    </div>
  );
}
```

### 6.5 Typography Panel

```typescript
// builder/components/FloatingToolbox/panels/TypographyPanel.tsx
export function TypographyPanel({ element }: PanelProps) {
  const updateStyle = useEditorStore(state => state.updateStyle);
  const styles = element.computedStyles;

  return (
    <div className={styles.panel}>
      <PropertyRow label="Font Family">
        <FontFamilySelect
          value={styles.fontFamily}
          onChange={(v) => updateStyle('font-family', v)}
        />
      </PropertyRow>

      <PropertyRow label="Size">
        <UnitInput
          value={styles.fontSize}
          onChange={(v) => updateStyle('font-size', v)}
        />
      </PropertyRow>

      <PropertyRow label="Weight">
        <Select
          value={styles.fontWeight}
          options={[
            { value: '300', label: 'Light' },
            { value: '400', label: 'Regular' },
            { value: '500', label: 'Medium' },
            { value: '600', label: 'Semibold' },
            { value: '700', label: 'Bold' },
          ]}
          onChange={(v) => updateStyle('font-weight', v)}
        />
      </PropertyRow>

      <PropertyRow label="Line Height">
        <UnitInput
          value={styles.lineHeight}
          onChange={(v) => updateStyle('line-height', v)}
        />
      </PropertyRow>

      <PropertyRow label="Letter Spacing">
        <UnitInput
          value={styles.letterSpacing}
          onChange={(v) => updateStyle('letter-spacing', v)}
        />
      </PropertyRow>

      <PropertyRow label="Align">
        <SegmentedControl
          value={styles.textAlign}
          options={[
            { value: 'left', icon: AlignLeftIcon },
            { value: 'center', icon: AlignCenterIcon },
            { value: 'right', icon: AlignRightIcon },
            { value: 'justify', icon: AlignJustifyIcon },
          ]}
          onChange={(v) => updateStyle('text-align', v)}
        />
      </PropertyRow>
    </div>
  );
}
```

### 6.6 Variants (Context Menu)

Variants are accessed through the element context menu rather than the FloatingToolbox tabs. This keeps the toolbox focused on styling while variants (which affect the component's React code) are a separate concern.

```typescript
// builder/components/Canvas/ElementContextMenu.tsx
export function ElementContextMenu({ element, position }: ContextMenuProps) {
  const [showVariants, setShowVariants] = useState(false);
  const appliedVariants = useEditorStore(state => state.getAppliedVariants(element.target));
  const availableVariants = useEditorStore(state => state.getAvailableVariants(element.target));

  return (
    <ContextMenu position={position}>
      <ContextMenuItem icon={CopyIcon} onClick={() => setShowVariants(true)}>
        Variants
        {appliedVariants.length > 0 && (
          <Badge>{appliedVariants.length}</Badge>
        )}
      </ContextMenuItem>
      {/* ... other menu items ... */}

      {showVariants && (
        <VariantsSubmenu
          element={element}
          appliedVariants={appliedVariants}
          availableVariants={availableVariants}
          onClose={() => setShowVariants(false)}
        />
      )}
    </ContextMenu>
  );
}
```

---

## 7. Input Components

### 7.1 Unit Input

```typescript
// builder/components/inputs/UnitInput.tsx
interface UnitInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  units?: string[];
}

const DEFAULT_UNITS = ['px', 'rem', 'em', '%', 'vh', 'vw'];

export function UnitInput({
  value,
  onChange,
  placeholder = '0',
  units = DEFAULT_UNITS,
}: UnitInputProps) {
  const { numericValue, unit } = parseValueWithUnit(value);

  const handleNumberChange = (newNum: string) => {
    onChange(`${newNum}${unit || 'px'}`);
  };

  const handleUnitChange = (newUnit: string) => {
    onChange(`${numericValue}${newUnit}`);
  };

  return (
    <div className={styles.unitInput}>
      <input
        type="text"
        className={styles.numberInput}
        value={numericValue}
        onChange={(e) => handleNumberChange(e.target.value)}
        placeholder={placeholder}
      />
      <select
        className={styles.unitSelect}
        value={unit || 'px'}
        onChange={(e) => handleUnitChange(e.target.value)}
      >
        {units.map(u => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
    </div>
  );
}

function parseValueWithUnit(value: string): { numericValue: string; unit: string } {
  const match = value.match(/^(-?[\d.]+)(.*)$/);
  if (match) {
    return { numericValue: match[1], unit: match[2] || 'px' };
  }
  return { numericValue: '', unit: 'px' };
}
```

### 7.2 Color Picker

```typescript
// builder/components/inputs/ColorPicker.tsx
interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hexValue = rgbToHex(value);

  return (
    <div className={styles.colorPicker}>
      <button
        className={styles.colorSwatch}
        style={{ backgroundColor: value }}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Color: ${value}`}
      />
      <input
        type="text"
        className={styles.colorInput}
        value={hexValue}
        onChange={(e) => onChange(e.target.value)}
      />

      {isOpen && (
        <div className={styles.colorPopover}>
          <ColorWheel value={value} onChange={onChange} />
          <ColorSwatches onSelect={onChange} />
        </div>
      )}
    </div>
  );
}
```

### 7.3 Segmented Control

```typescript
// builder/components/inputs/SegmentedControl.tsx
interface SegmentedControlProps {
  value: string;
  options: Array<{
    value: string;
    label?: string;
    icon?: IconType;
  }>;
  onChange: (value: string) => void;
}

export function SegmentedControl({ value, options, onChange }: SegmentedControlProps) {
  return (
    <div className={styles.segmentedControl} role="radiogroup">
      {options.map(option => (
        <button
          key={option.value}
          className={clsx(styles.segment, {
            [styles.active]: value === option.value,
          })}
          onClick={() => onChange(option.value)}
          role="radio"
          aria-checked={value === option.value}
          title={option.label || option.value}
        >
          {option.icon ? <option.icon size={16} /> : option.label}
        </button>
      ))}
    </div>
  );
}
```

---

## 8. Status Bar

```typescript
// builder/components/StatusBar/StatusBar.tsx
export function StatusBar() {
  const { wsConnected, pendingEdits, selectedElement } = useEditorStore();
  const pendingCount = pendingEdits.size;

  return (
    <footer className={styles.statusBar}>
      <div className={styles.left}>
        {/* Connection status */}
        <div className={styles.connectionStatus}>
          <span className={clsx(styles.dot, {
            [styles.connected]: wsConnected,
            [styles.disconnected]: !wsConnected,
          })} />
          <span>{wsConnected ? 'Connected' : 'Disconnected'}</span>
        </div>

        {/* Pending edits */}
        {pendingCount > 0 && (
          <div className={styles.pending}>
            <Spinner size={12} />
            <span>{pendingCount} pending</span>
          </div>
        )}
      </div>

      <div className={styles.right}>
        {/* Current file location */}
        {selectedElement && (
          <div className={styles.location}>
            <FileIcon size={12} />
            <span>
              {shortenPath(selectedElement.target.file)}:{selectedElement.target.lineNumber}
            </span>
          </div>
        )}
      </div>
    </footer>
  );
}
```

---

## 9. Design Tokens

```css
/* styles/tokens.module.css */
:root {
  /* Colors - Light theme */
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-primary-alpha: rgba(37, 99, 235, 0.1);

  --color-surface: #ffffff;
  --color-surface-elevated: #f8fafc;
  --color-canvas-bg: #f1f5f9;
  --color-canvas-dot: #cbd5e1;

  --color-border: #e2e8f0;
  --color-border-focus: #2563eb;

  --color-text: #0f172a;
  --color-text-muted: #64748b;
  --color-text-disabled: #94a3b8;

  --color-hover: rgba(0, 0, 0, 0.04);
  --color-active: rgba(0, 0, 0, 0.08);

  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-error: #ef4444;

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', 'Consolas', monospace;

  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 14px;
  --text-lg: 16px;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

  /* Borders */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
}

/* Dark theme */
[data-theme='dark'] {
  --color-primary: #3b82f6;
  --color-primary-hover: #60a5fa;
  --color-primary-alpha: rgba(59, 130, 246, 0.15);

  --color-surface: #1e293b;
  --color-surface-elevated: #334155;
  --color-canvas-bg: #0f172a;
  --color-canvas-dot: #334155;

  --color-border: #334155;

  --color-text: #f1f5f9;
  --color-text-muted: #94a3b8;
  --color-text-disabled: #64748b;

  --color-hover: rgba(255, 255, 255, 0.04);
  --color-active: rgba(255, 255, 255, 0.08);
}
```

---

## 10. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Escape` | Deselect / Cancel edit |
| `Delete / Backspace` | Remove selected variant |
| `Enter` | Confirm text edit |
| `Tab` | Next input in panel |
| `Shift + Tab` | Previous input in panel |
| `Cmd/Ctrl + \` | Toggle properties panel |
| `Cmd/Ctrl + P` | Toggle preview mode |
| `Cmd/Ctrl + 0` | Reset zoom to 100% |
| `Cmd/Ctrl + +` | Zoom in |
| `Cmd/Ctrl + -` | Zoom out |

```typescript
// builder/hooks/useKeyboardShortcuts.ts
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Undo
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useEditorStore.getState().undo();
      }

      // Redo
      if (isMod && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        useEditorStore.getState().redo();
      }

      // Deselect
      if (e.key === 'Escape') {
        e.preventDefault();
        useEditorStore.getState().clearSelection();
      }

      // Toggle preview
      if (isMod && e.key === 'p') {
        e.preventDefault();
        useEditorStore.getState().togglePreviewMode();
      }

      // Reset zoom
      if (isMod && e.key === '0') {
        e.preventDefault();
        useEditorStore.getState().setZoom(100);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
```

---

## 11. Responsive Behavior

The Builder UI is designed for desktop use (1280px+). The FloatingToolbox adapts automatically via Floating UI's positioning:

```css
/* layout.module.css */
.mainLayout {
  display: grid;
  grid-template-rows: 48px 1fr 24px;
  grid-template-columns: 1fr;
  height: 100vh;
}

.toolbar {
  grid-column: 1;
  grid-row: 1;
}

.canvas {
  grid-column: 1;
  grid-row: 2;
  position: relative; /* For FloatingToolbox positioning context */
}

.statusBar {
  grid-column: 1;
  grid-row: 3;
}

/* FloatingToolbox is positioned by Floating UI, no grid rules needed */
/* It automatically flips/shifts to stay within viewport bounds */
```

---

## 12. Accessibility

### 12.1 Focus Management

```typescript
// builder/hooks/useFocusTrap.ts
export function useFocusTrap(containerRef: RefObject<HTMLElement>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const focusableElements = containerRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    containerRef.current.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();

    return () => {
      containerRef.current?.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive, containerRef]);
}
```

### 12.2 ARIA Labels

All interactive elements include appropriate ARIA attributes:

```typescript
// Example: Icon buttons always have aria-label
<IconButton
  icon={UndoIcon}
  onClick={handleUndo}
  disabled={!canUndo}
  aria-label="Undo last change"
/>

// Example: Sections are properly labeled
<section aria-labelledby="spacing-header">
  <h3 id="spacing-header">Spacing</h3>
  {/* content */}
</section>
```

### 12.3 Color Contrast

All text meets WCAG AA contrast requirements:
- Regular text: 4.5:1 minimum
- Large text (18px+): 3:1 minimum
- UI components: 3:1 minimum
