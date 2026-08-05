// ── Map Feature Popup (Pin-Anchored Info Card) ─────────────────────────────
// A Google Maps-style info window anchored at a feature's screen position.
// Positioned absolutely within the map container with a downward arrow pointer.
// Shows ALL feature attributes with proper LayerSchema labels.

import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { useThemeStore } from '../stores/theme';
import { Spacing, Radius } from '../theme/colors';
import { getLayerSchema } from '../stores/layer-schemas';
import MapPin from 'lucide-react-native/icons/map-pin';
import X from 'lucide-react-native/icons/x';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import FileText from 'lucide-react-native/icons/file-text';
import Edit3 from 'lucide-react-native/icons/pen-line';
import Camera from 'lucide-react-native/icons/camera';
import Crosshair from 'lucide-react-native/icons/crosshair';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';

// ── Types ─────────────────────────────────────────────────────────────────

export interface FeaturePopupProps {
  /** Screen pixel position (relative to map container) */
  screenX: number;
  screenY: number;
  /** Feature info */
  featureName: string;
  layerName: string;
  status: string;
  /** Key-value property pairs to display */
  properties: [string, unknown][];
  /** Layer ID for looking up schema labels */
  layerId?: string;
  /** Manually overridden label map (from map.tsx) */
  labelOverrides?: Record<string, string>;
  /** Callbacks */
  onClose: () => void;
  onOpenDetails: () => void;
  onDismiss: () => void;
  /** Geometry type for contextual editing */
  featureGeometryType?: 'Point' | 'LineString' | 'Polygon';
  /** Called when user taps Edit to enter editing mode */
  onStartEdit?: () => void;
  /** Notes */
  notesDraft: string;
  onNotesChange: (text: string) => void;
  onSaveNotes: () => void;
  hasUnsavedNotes: boolean;
}

// ── Arrow pointer size ────────────────────────────────────────────────────
const ARROW_SIZE = 10;

/** Popup width as a fraction of screen width, clamped between 200–260 */
function getPopupWidth(screenWidth: number): number {
  return Math.max(200, Math.min(260, Math.round(screenWidth * 0.65)));
}

// ── Component ─────────────────────────────────────────────────────────────

export default function MapFeaturePopup({
  screenX,
  screenY,
  featureName,
  layerName,
  status,
  properties,
  layerId,
  labelOverrides,
  onClose,
  onOpenDetails,
  onDismiss,
  onStartEdit,
  featureGeometryType,
  notesDraft,
  onNotesChange,
  onSaveNotes,
  hasUnsavedNotes,
}: FeaturePopupProps) {
  const colors = useThemeStore((s) => s.colors);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.back(1.1)),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // ── Responsive dimensions ────────────────────────────────────────────────
  const { width: screenW } = useWindowDimensions();
  const popupWidth = useMemo(() => getPopupWidth(screenW), [screenW]);

  // Schema lookup for proper labels
  const schema = useMemo(() => layerId ? getLayerSchema(layerId) : null, [layerId]);

  /** Get a human-readable label for a property key using the LayerSchema */
  const getLabel = useMemo(() => {
    return (key: string): string => {
      if (labelOverrides?.[key]) return labelOverrides[key];
      if (!schema) return key.replace(/_/g, ' ');
      const allFields = [...schema.readOnlyFields, ...schema.editableFields];
      const found = allFields.find((f) => f.key === key);
      if (found) return found.label;
      return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    };
  }, [schema, labelOverrides]);

  /** Format a property value for display (booleans, numbers, enums) */
  const formatValue = (key: string, val: unknown): string => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    // Check if schema has options for this key - show human label
    if (schema) {
      const allFields = [...schema.readOnlyFields, ...schema.editableFields];
      const field = allFields.find((f) => f.key === key);
      const fieldOptions = (field as { options?: { label: string; value: string }[] } | undefined)?.options;
      if (fieldOptions) {
        const opt = fieldOptions.find((o) => o.value === String(val));
        if (opt) return opt.label;
      }
    }
    return String(val);
  };

  const [showAllProps, setShowAllProps] = useState(false);

  // ── Sort properties: schema readOnly first, then editable, then rest ──
  const sortedProperties = useMemo(() => {
    if (!schema) return properties;
    const roKeys = new Set(schema.readOnlyFields.map((f) => f.key));
    const edKeys = new Set(schema.editableFields.map((f) => f.key));
    const ro: [string, unknown][] = [];
    const ed: [string, unknown][] = [];
    const rest: [string, unknown][] = [];
    for (const [key, val] of properties) {
      if (roKeys.has(key)) ro.push([key, val]);
      else if (edKeys.has(key)) ed.push([key, val]);
      else rest.push([key, val]);
    }
    // Sort each group by the order they appear in the schema
    const roOrdered = schema.readOnlyFields
      .filter((f) => roKeys.has(f.key))
      .map((f) => ro.find(([k]) => k === f.key)!)
      .filter(Boolean);
    const edOrdered = schema.editableFields
      .filter((f) => edKeys.has(f.key))
      .map((f) => ed.find(([k]) => k === f.key)!)
      .filter(Boolean);
    return [...roOrdered, ...edOrdered, ...rest];
  }, [properties, schema]);

  const displayProps = showAllProps ? sortedProperties : sortedProperties.slice(0, 6);

  // Compute position — popup appears ABOVE the pin (screenY), centered horizontally
  const estimationHeight = Math.min(properties.length * 22 + 200, 380);
  const popupLeft = Math.max(12, Math.min(screenX - popupWidth / 2, screenW - popupWidth - 12));
  const popupTop = Math.max(8, screenY - estimationHeight - ARROW_SIZE - 4);

  // Status color
  const statusColor =
    status === 'completed'
      ? colors.success
      : status === 'under_review'
        ? colors.warning
        : status === 'approved'
          ? colors.success
          : colors.textTertiary;

  // Arrow horizontal position (centered on pin)
  const arrowLeft = Math.max(ARROW_SIZE, Math.min(popupWidth - ARROW_SIZE, screenX - popupLeft - ARROW_SIZE));

  return (
    <Animated.View
      style={[
        styles.container,
        {
          left: popupLeft,
          top: popupTop,
          width: popupWidth,
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }, { translateY: 0 }],
        },
      ]}
    >
      {/* Main card */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {/* Header row: feature name + status badge + close */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MapPin size={14} stroke={colors.primary} />
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {featureName}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.background }]}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={12} stroke={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Layer name */}
        <Text style={[styles.layerName, { color: colors.textTertiary }]} numberOfLines={1}>
          {layerName}
        </Text>

        {/* Properties — show up to 6, expandable */}
        {properties.length > 0 && (
          <ScrollView
            style={styles.propsScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.propsContainer, { backgroundColor: colors.background }]}>
              {displayProps.map(([key, val]) => (
                <View key={key} style={styles.propRow}>
                  <Text style={[styles.propKey, { color: colors.textTertiary }]} numberOfLines={1}>
                    {getLabel(key)}
                  </Text>
                  <Text style={[styles.propVal, { color: colors.textPrimary }]} numberOfLines={1}>
                    {formatValue(key, val)}
                  </Text>
                </View>
              ))}
            </View>
            {properties.length > 6 && (
              <TouchableOpacity
                style={[styles.expandBtn, { borderTopColor: colors.outlineLight }]}
                onPress={() => setShowAllProps(!showAllProps)}
                activeOpacity={0.6}
              >
                <Text style={[styles.expandText, { color: colors.primary }]}>
                  {showAllProps ? 'Show less' : `+${properties.length - 6} more attributes`}
                </Text>
                {showAllProps ? (
                  <ChevronUp size={10} stroke={colors.primary} />
                ) : (
                  <ChevronDown size={10} stroke={colors.primary} />
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

        {/* Required Photos indicator */}
        {schema && schema.requiredPhotos.length > 0 && (
          <View style={[styles.photoReq, { backgroundColor: colors.warning + '10' }]}>
            <Camera size={10} stroke={colors.warning} />
            <Text style={[styles.photoReqText, { color: colors.warning }]} numberOfLines={1}>
              {schema.requiredPhotos.length} photo{schema.requiredPhotos.length !== 1 ? 's' : ''} required: {schema.requiredPhotos.join(', ')}
            </Text>
          </View>
        )}

        {/* GPS Accuracy indicator */}
        {schema && schema.gpsAccuracyM && (
          <View style={[styles.gpsReq, { backgroundColor: colors.primary + '10' }]}>
            <Crosshair size={10} stroke={colors.primary} />
            <Text style={[styles.gpsReqText, { color: colors.primary }]}>
              GPS accuracy: within {schema.gpsAccuracyM}m
            </Text>
          </View>
        )}

        {/* Quick notes */}
        <View style={styles.notesRow}>
          <Edit3 size={12} stroke={colors.textTertiary} />
          <TextInput
            style={[styles.notesInput, { color: colors.textPrimary, borderColor: colors.outline }]}
            value={notesDraft}
            onChangeText={onNotesChange}
            placeholder="Add note..."
            placeholderTextColor={colors.textTertiary}
          />
          {hasUnsavedNotes && (
            <TouchableOpacity
              style={[styles.notesSaveBtn, { backgroundColor: colors.primary }]}
              onPress={onSaveNotes}
              activeOpacity={0.7}
            >
              <FileText size={11} stroke={colors.onPrimary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          {onStartEdit && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={onStartEdit}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionText, { color: colors.onPrimary }]}>
                ✏️ Edit
              </Text>
              <ChevronRight size={13} stroke={colors.onPrimary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={onOpenDetails}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionText, { color: colors.onPrimary }]}>Open Details</Text>
            <ChevronRight size={13} stroke={colors.onPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dismissBtn, { borderColor: colors.outline }]}
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Text style={[styles.dismissText, { color: colors.textSecondary }]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Downward arrow pointer */}
      <View style={[styles.arrowContainer, { left: arrowLeft }]}>
        <View style={[styles.arrow, { borderTopColor: colors.surface }]} />
      </View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 30,
    // pointerEvents: 'box-none', // not valid in RN, handle via View
  },
  card: {
    borderRadius: Radius.md,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  layerName: {
    fontSize: 9,
    fontWeight: '500',
    marginBottom: 4,
    marginLeft: 16,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  closeBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  propsScroll: {
    maxHeight: 120,
    marginBottom: 4,
  },
  propsContainer: {
    borderRadius: 6,
    padding: 4,
  },
  propRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1,
  },
  propKey: {
    fontSize: 9,
    fontWeight: '500',
    textTransform: 'capitalize',
    flex: 1,
    marginRight: 4,
  },
  propVal: {
    fontSize: 9,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 3,
    paddingBottom: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandText: {
    fontSize: 9,
    fontWeight: '600',
  },
  photoReq: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 2,
  },
  photoReqText: {
    fontSize: 8,
    fontWeight: '600',
    flex: 1,
  },
  gpsReq: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 3,
  },
  gpsReqText: {
    fontSize: 8,
    fontWeight: '600',
  },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 4,
  },
  notesInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    fontSize: 10,
    height: 24,
  },
  notesSaveBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 3,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 6,
    gap: 2,
  },
  actionText: {
    fontSize: 10,
    fontWeight: '700',
  },
  dismissBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  dismissText: {
    fontSize: 10,
    fontWeight: '600',
  },
  arrowContainer: {
    position: 'absolute',
    bottom: -ARROW_SIZE,
    width: ARROW_SIZE * 2,
    height: ARROW_SIZE,
    alignItems: 'center',
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderTopWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    // borderTopColor is set dynamically via inline style
  },
});
