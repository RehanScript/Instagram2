import React, { useState, useEffect, createContext, useContext, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  ActivityIndicator,
  Keyboard,
  Platform,
  StatusBar,
  TouchableWithoutFeedback,
  PanResponder,
  ScrollView,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

// --- TYPES & CONSTANTS ---
interface ReelItem {
  id: string;
  url: string;
  normalizedUrl: string;
  shortcode: string;
  category: string;
  dateAdded: string;
}

const STORAGE_REELS_KEY = '@instagram2_reels_library_v2';
const STORAGE_CATEGORIES_KEY = '@instagram2_categories_v2';

const DEFAULT_CATEGORIES = ['Motivational', 'Funny', 'Random'];

const REEL_REGEX = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|reels|p|share\/reel)\/([a-zA-Z0-9_-]+)/i;

const Colors = {
  background: '#000000',
  surface: '#121212',
  surfaceElevated: '#1E1E1E',
  surfaceVariant: '#262626',
  border: '#2E2E2E',
  textPrimary: '#FFFFFF',
  textSecondary: '#A8A8A8',
  textTertiary: '#737373',
  igPink: '#E1306C',
  igOrange: '#F56040',
  danger: '#ED4956',
  accent: '#3897F0',
};

// --- INJECTED FULLSCREEN CSS & AUTOPLAY SCRIPT ---
// Preserves original aspect ratio (object-fit: contain), hides all Instagram web UI, autoplays video
const INJECTED_ORIGINAL_RATIO_AUTOPLAY_JS = `
  (function() {
    function injectCleanStyles() {
      if (document.getElementById('ig2-original-ratio-css')) return;
      var style = document.createElement('style');
      style.id = 'ig2-original-ratio-css';
      style.type = 'text/css';
      style.innerHTML = \`
        * {
          box-sizing: border-box !important;
        }
        html, body {
          width: 100vw !important;
          height: 100vh !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background-color: #000000 !important;
        }

        /* HIDE ALL HEADERS, FOOTERS, COMMENTS, BUTTONS, CARDS */
        .Header, header, div[class*="Header"],
        .Footer, footer, div[class*="Footer"],
        .Feedback, div[class*="Feedback"],
        .Caption, div[class*="Caption"],
        .HoverCard, div[class*="HoverCard"],
        .SocialContext, div[class*="SocialContext"],
        div[class*="Engagement"],
        div[role="dialog"],
        div[class*="LoggedOut"],
        div[class*="signup"],
        div[class*="login"],
        ._aa5b, ._aa5d, ._ab8w, .x1n2onr6.x1ja2u2z,
        a[href*="/p/"], a[href*="/reel/"],
        .HoverCardParent,
        .videoSpritePlayButton {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
          max-height: 0 !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* FULLSCREEN VIEWPORT CONTAINER - BLACK BACKGROUND */
        #react-root, .Root, .EmbeddedMedia, div[class*="EmbeddedMedia"],
        .Content, div[class*="Content"], .EmbeddedMediaImage, div[class*="EmbeddedMediaImage"] {
          width: 100vw !important;
          height: 100vh !important;
          max-width: 100vw !important;
          max-height: 100vh !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          background-color: #000000 !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }

        /* PRESERVE ORIGINAL ASPECT RATIO: 9:16, 1:1, 16:9 WITHOUT ZOOMING OR CROPPING */
        video, .EmbeddedVideo, video[class*="EmbeddedVideo"] {
          width: 100% !important;
          height: 100% !important;
          max-width: 100vw !important;
          max-height: 100vh !important;
          object-fit: contain !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          margin: auto !important;
          padding: 0 !important;
          background-color: #000000 !important;
          z-index: 10 !important;
        }

        /* HIDE WHITE PLAY OVERLAY */
        .PlayButton, button[aria-label*="Play"] {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      \`;
      (document.head || document.documentElement).appendChild(style);
    }

    function triggerAutoplay() {
      injectCleanStyles();

      var videos = document.querySelectorAll('video');
      videos.forEach(function(v) {
        v.muted = false;
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.setAttribute('autoplay', '');
        v.style.objectFit = 'contain';

        var promise = v.play();
        if (promise !== undefined) {
          promise.catch(function() {
            v.muted = true;
            v.play();
          });
        }
      });

      var playButtons = document.querySelectorAll('.PlayButton, button[aria-label*="Play"], .videoSpritePlayButton, [role="button"]');
      playButtons.forEach(function(b) {
        try { b.click(); } catch(e) {}
      });
    }

    triggerAutoplay();

    try {
      var observer = new MutationObserver(function() {
        triggerAutoplay();
      });
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
      });
    } catch(e) {}

    var attempts = 0;
    var timer = setInterval(function() {
      attempts++;
      triggerAutoplay();
      var v = document.querySelector('video');
      if ((v && !v.paused && v.currentTime > 0) || attempts > 25) {
        clearInterval(timer);
      }
    }, 200);

    document.addEventListener('click', function() {
      var v = document.querySelector('video');
      if (v) {
        v.muted = false;
        v.play();
      }
    }, { passive: true });
  })();
  true;
`;

function validateUrl(input: string) {
  const match = input.trim().match(REEL_REGEX);
  if (match && match[1]) {
    return {
      isValid: true,
      shortcode: match[1],
      normalizedUrl: `https://www.instagram.com/reel/${match[1]}/`,
    };
  }
  return { isValid: false, shortcode: '', normalizedUrl: '' };
}

function shuffleList(list: ReelItem[]): ReelItem[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --- CONTEXT ---
interface ReelContextType {
  reels: ReelItem[];
  categories: string[];
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  filteredQueue: ReelItem[];
  currentIndex: number;
  setCurrentIndex: (idx: number) => void;
  addReel: (url: string, category: string) => Promise<boolean>;
  deleteReel: (id: string) => Promise<void>;
  updateReelCategory: (id: string, newCategory: string) => Promise<void>;
  addCategory: (name: string) => Promise<boolean>;
  deleteCategory: (name: string) => Promise<void>;
  playReel: (reel: ReelItem) => void;
  loadSamples: () => Promise<void>;
  reshuffle: () => void;
}

const ReelCtx = createContext<ReelContextType | null>(null);

function ReelProvider({ children }: { children: React.ReactNode }) {
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [currentIndex, setCurrentIndex] = useState(0);

  // Load saved data locally on phone
  useEffect(() => {
    (async () => {
      try {
        const storedCats = await AsyncStorage.getItem(STORAGE_CATEGORIES_KEY);
        if (storedCats) {
          const parsedCats = JSON.parse(storedCats);
          if (Array.isArray(parsedCats) && parsedCats.length > 0) {
            setCategories(parsedCats);
          }
        }
        const storedReels = await AsyncStorage.getItem(STORAGE_REELS_KEY);
        if (storedReels) {
          const parsedReels: ReelItem[] = JSON.parse(storedReels);
          setReels(parsedReels);
        }
      } catch (e) {}
    })();
  }, []);

  const saveReels = async (list: ReelItem[]) => {
    setReels(list);
    await AsyncStorage.setItem(STORAGE_REELS_KEY, JSON.stringify(list));
  };

  const saveCategories = async (cats: string[]) => {
    setCategories(cats);
    await AsyncStorage.setItem(STORAGE_CATEGORIES_KEY, JSON.stringify(cats));
  };

  // Add custom category
  const addCategory = async (name: string): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Category Exists', `"${trimmed}" already exists.`);
      return false;
    }
    const updated = [...categories, trimmed];
    await saveCategories(updated);
    return true;
  };

  // Delete category (reels in it get moved to 'Random')
  const deleteCategory = async (name: string) => {
    if (categories.length <= 1) {
      Alert.alert('Cannot Delete', 'You must have at least one category.');
      return;
    }
    const updatedCats = categories.filter((c) => c !== name);
    await saveCategories(updatedCats);

    const fallbackCat = updatedCats[0] || 'Random';
    const updatedReels = reels.map((r) =>
      r.category === name ? { ...r, category: fallbackCat } : r
    );
    await saveReels(updatedReels);

    if (selectedCategory === name) {
      setSelectedCategory('All');
    }
  };

  // Filter queue by active category
  const filteredReels = useMemo(() => {
    if (selectedCategory === 'All') {
      return reels;
    }
    return reels.filter((r) => r.category === selectedCategory);
  }, [reels, selectedCategory]);

  const [filteredQueue, setFilteredQueue] = useState<ReelItem[]>([]);

  // Update and shuffle queue whenever category changes or reels update
  useEffect(() => {
    setFilteredQueue(shuffleList(filteredReels));
    setCurrentIndex(0);
  }, [filteredReels]);

  const reshuffle = () => {
    setFilteredQueue(shuffleList(filteredReels));
    setCurrentIndex(0);
  };

  const addReel = async (rawUrl: string, category: string): Promise<boolean> => {
    const valid = validateUrl(rawUrl);
    if (!valid.isValid) {
      Alert.alert('Invalid URL', 'Please paste a valid Instagram Reel link.');
      return false;
    }
    if (reels.some((r) => r.shortcode === valid.shortcode)) {
      Alert.alert('Already Saved', 'This Reel is already in your library.');
      return false;
    }
    const item: ReelItem = {
      id: Date.now().toString(),
      url: rawUrl.trim(),
      normalizedUrl: valid.normalizedUrl,
      shortcode: valid.shortcode,
      category: category || categories[0] || 'Random',
      dateAdded: new Date().toISOString(),
    };
    const updated = [item, ...reels];
    await saveReels(updated);
    return true;
  };

  const deleteReel = async (id: string) => {
    const updated = reels.filter((r) => r.id !== id);
    await saveReels(updated);
  };

  const updateReelCategory = async (id: string, newCategory: string) => {
    const updated = reels.map((r) =>
      r.id === id ? { ...r, category: newCategory } : r
    );
    await saveReels(updated);
  };

  const playReel = (reel: ReelItem) => {
    setSelectedCategory(reel.category);
    // Queue will update and place this reel at start
    setTimeout(() => {
      const idx = filteredQueue.findIndex((r) => r.id === reel.id);
      if (idx >= 0) {
        setCurrentIndex(idx);
      }
    }, 50);
  };

  const loadSamples = async () => {
    const samples = [
      { url: 'https://www.instagram.com/reel/C-8PzB6tZ7I/', cat: 'Motivational' },
      { url: 'https://www.instagram.com/reel/C_X3_8gSp7u/', cat: 'Funny' },
      { url: 'https://www.instagram.com/reel/DAq7f4VvO0l/', cat: 'Random' },
    ];
    let updated = [...reels];
    for (const s of samples) {
      const valid = validateUrl(s.url);
      if (valid.isValid && !updated.some((r) => r.shortcode === valid.shortcode)) {
        updated.push({
          id: Date.now().toString() + Math.random().toString(),
          url: s.url,
          normalizedUrl: valid.normalizedUrl,
          shortcode: valid.shortcode,
          category: s.cat,
          dateAdded: new Date().toISOString(),
        });
      }
    }
    await saveReels(updated);
  };

  return (
    <ReelCtx.Provider
      value={{
        reels,
        categories,
        selectedCategory,
        setSelectedCategory,
        filteredQueue,
        currentIndex,
        setCurrentIndex,
        addReel,
        deleteReel,
        updateReelCategory,
        addCategory,
        deleteCategory,
        playReel,
        loadSamples,
        reshuffle,
      }}
    >
      {children}
    </ReelCtx.Provider>
  );
}

const useReel = () => useContext(ReelCtx)!;

// --- REEL VIEWER ITEM (FULLSCREEN WITH ORIGINAL ASPECT RATIO, VERTICAL SWIPE & CATEGORIES) ---
function ReelViewer({
  reel,
  index,
  total,
  category,
  onNext,
  onPrev,
  onReshuffle,
  onDelete,
}: any) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const webViewRef = useRef<WebView>(null);

  const embedUrl = `https://www.instagram.com/reel/${reel.shortcode}/embed/`;
  const topPadding = Math.max(insets.top, StatusBar.currentHeight || 0, 48);

  const toggleSound = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        var v = document.querySelector('video');
        if (v) { v.muted = ${nextMuted}; }
        true;
      `);
    }
  };

  // Vertical Swipe Gesture Handler
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 12;
      },
      onPanResponderRelease: (_, gestureState) => {
        const SWIPE_THRESHOLD = 35;
        if (gestureState.dy < -SWIPE_THRESHOLD) {
          if (index < total - 1) onNext();
        } else if (gestureState.dy > SWIPE_THRESHOLD) {
          if (index > 0) onPrev();
        } else if (Math.abs(gestureState.dx) < 8 && Math.abs(gestureState.dy) < 8) {
          toggleSound();
        }
      },
    })
  ).current;

  return (
    <View style={styles.viewerContainer} {...panResponder.panHandlers}>
      {/* Video Player - Preserves Original Ratio (object-fit: contain) */}
      {Platform.OS === 'web' ? (
        <iframe
          src={embedUrl}
          style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#000' }}
          onLoad={() => setLoading(false)}
        />
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: embedUrl }}
          style={styles.webView}
          containerStyle={styles.webViewContainer}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scalesPageToFit={true}
          androidLayerType="hardware"
          mixedContentMode="always"
          injectedJavaScript={INJECTED_ORIGINAL_RATIO_AUTOPLAY_JS}
          userAgent="Mozilla/5.0 (Linux; Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0"
          onLoadEnd={() => setLoading(false)}
        />
      )}

      {loading && (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={Colors.igPink} />
        </View>
      )}

      {/* Top Floating Overlay (Title, Sound Toggle & Menu) */}
      <View style={[styles.topBar, { top: topPadding }]}>
        <View style={styles.brandRow}>
          <Text style={styles.brandTitle}>
            Instagram <Text style={{ color: Colors.igPink }}>2</Text>
          </Text>
          <View style={styles.categoryPillTop}>
            <Text style={styles.categoryPillTopText}>{category}</Text>
          </View>
        </View>

        <View style={styles.topActionsRow}>
          <TouchableOpacity style={styles.circleBtn} onPress={toggleSound} activeOpacity={0.7}>
            <Ionicons
              name={isMuted ? 'volume-mute' : 'volume-high'}
              size={18}
              color="#fff"
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.circleBtn} onPress={() => setMenu(true)} activeOpacity={0.7}>
            <Ionicons name="ellipsis-vertical" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Floating Minimal Info (NO "Open in Instagram" button) */}
      <View style={styles.bottomBar}>
        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>#{reel.category}</Text>
          </View>
          <Text style={styles.counterText}>
            {index + 1} of {total} • Swipe ↑↓
          </Text>
        </View>
      </View>

      {/* Action Menu Modal */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <TouchableWithoutFeedback onPress={() => setMenu(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <TouchableOpacity
                style={styles.sheetItem}
                onPress={() => {
                  setMenu(false);
                  Clipboard.setStringAsync(reel.normalizedUrl);
                  Alert.alert('Copied', 'Reel link copied.');
                }}
              >
                <Ionicons name="copy-outline" size={20} color="#fff" />
                <Text style={styles.sheetText}>Copy Link</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetItem}
                onPress={() => {
                  setMenu(false);
                  onReshuffle();
                }}
              >
                <Ionicons name="shuffle-outline" size={20} color={Colors.igOrange} />
                <Text style={styles.sheetText}>Reshuffle {category}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sheetItem, { borderBottomWidth: 0 }]}
                onPress={() => {
                  setMenu(false);
                  onDelete(reel.id);
                }}
              >
                <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                <Text style={[styles.sheetText, { color: Colors.danger }]}>Remove from Library</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

// --- REELS SCREEN (WITH CATEGORY BAR AT TOP) ---
function ReelsScreen({ onGoLinks }: { onGoLinks: () => void }) {
  const {
    filteredQueue,
    currentIndex,
    setCurrentIndex,
    categories,
    selectedCategory,
    setSelectedCategory,
    reshuffle,
    deleteReel,
    loadSamples,
  } = useReel();

  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, StatusBar.currentHeight || 0, 48);

  const allCategoryTabs = ['All', ...categories];

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {/* Category Switcher Bar directly under top status bar */}
      <View style={[styles.categoryBarContainer, { top: topPadding + 44 }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {allCategoryTabs.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  isSelected && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    isSelected && styles.categoryChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {filteredQueue.length === 0 ? (
        <View style={[styles.emptyCenter, { paddingTop: topPadding + 60 }]}>
          <Ionicons name="film-outline" size={54} color={Colors.igPink} />
          <Text style={styles.emptyTitle}>
            No reels in "{selectedCategory}"
          </Text>
          <Text style={styles.emptySubtitle}>
            Add reels under this category in the Link Manager or load sample reels.
          </Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={onGoLinks}>
            <Text style={styles.emptyBtnText}>Go to Link Manager</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sampleBtn} onPress={loadSamples}>
            <Text style={styles.sampleBtnText}>Load Sample Reels</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ReelViewer
          reel={filteredQueue[currentIndex] || filteredQueue[0]}
          index={currentIndex}
          total={filteredQueue.length}
          category={selectedCategory}
          onNext={() =>
            setCurrentIndex(Math.min(currentIndex + 1, filteredQueue.length - 1))
          }
          onPrev={() => setCurrentIndex(Math.max(currentIndex - 1, 0))}
          onReshuffle={reshuffle}
          onDelete={deleteReel}
        />
      )}
    </View>
  );
}

// --- LINK MANAGER SCREEN (CREATE CATEGORIES & ORGANIZE REELS) ---
function LinksScreen({ onPlay }: { onPlay: () => void }) {
  const {
    reels,
    categories,
    selectedCategory,
    setSelectedCategory,
    addReel,
    deleteReel,
    updateReelCategory,
    addCategory,
    deleteCategory,
    playReel,
    loadSamples,
  } = useReel();

  const insets = useSafeAreaInsets();
  const [inputUrl, setInputUrl] = useState('');
  const [assignedCat, setAssignedCat] = useState<string>(categories[0] || 'Motivational');
  const [newCatName, setNewCatName] = useState('');
  const [showCatModal, setShowCatModal] = useState(false);
  const [editItem, setEditItem] = useState<ReelItem | null>(null);

  const topPadding = Math.max(insets.top, StatusBar.currentHeight || 0, 48);

  // Keep assignedCat valid if categories change
  useEffect(() => {
    if (!categories.includes(assignedCat) && categories.length > 0) {
      setAssignedCat(categories[0]);
    }
  }, [categories]);

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setInputUrl(text.trim());
  };

  const handleAddReel = async () => {
    if (!inputUrl.trim()) return;
    const ok = await addReel(inputUrl.trim(), assignedCat);
    if (ok) {
      setInputUrl('');
      Keyboard.dismiss();
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    const ok = await addCategory(newCatName.trim());
    if (ok) {
      setAssignedCat(newCatName.trim());
      setNewCatName('');
    }
  };

  // Filtered reels in manager
  const displayedReels = useMemo(() => {
    if (selectedCategory === 'All') return reels;
    return reels.filter((r) => r.category === selectedCategory);
  }, [reels, selectedCategory]);

  return (
    <View style={[styles.linksContainer, { paddingTop: topPadding }]}>
      {/* Header */}
      <View style={styles.linksHeader}>
        <View>
          <Text style={styles.headerTitle}>Link Manager</Text>
          <Text style={styles.headerSubtitle}>
            Saved locally on your phone ({reels.length} reels)
          </Text>
        </View>
        <TouchableOpacity
          style={styles.manageCatBtn}
          onPress={() => setShowCatModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="folder-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
          <Text style={styles.manageCatBtnText}>Categories</Text>
        </TouchableOpacity>
      </View>

      {/* Add Reel Card */}
      <View style={styles.inputCard}>
        <Text style={styles.inputLabel}>Paste Instagram Reel URL</Text>
        <TextInput
          style={styles.textInput}
          placeholder="https://www.instagram.com/reel/..."
          placeholderTextColor={Colors.textTertiary}
          value={inputUrl}
          onChangeText={setInputUrl}
          autoCapitalize="none"
        />

        {/* Category Selector for New Reel */}
        <View style={styles.categoryPickerRow}>
          <Text style={styles.categoryPickerLabel}>Assign Category:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.miniChip,
                  assignedCat === cat && styles.miniChipActive,
                ]}
                onPress={() => setAssignedCat(cat)}
              >
                <Text
                  style={[
                    styles.miniChipText,
                    assignedCat === cat && styles.miniChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity style={styles.pasteButton} onPress={handlePaste}>
            <Ionicons name="clipboard-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Paste</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={handleAddReel}>
            <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 4 }} />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
              Save to {assignedCat}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={{ marginBottom: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {['All', ...categories].map((cat) => {
            const count = cat === 'All' ? reels.length : reels.filter((r) => r.category === cat).length;
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.filterTabChip,
                  isSelected && styles.filterTabChipActive,
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text
                  style={[
                    styles.filterTabChipText,
                    isSelected && styles.filterTabChipTextActive,
                  ]}
                >
                  {cat} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Reels List */}
      {displayedReels.length === 0 ? (
        <View style={styles.emptyCenter}>
          <Ionicons name="bookmark-outline" size={48} color={Colors.textTertiary} />
          <Text style={styles.emptyTitle}>No saved reels in "{selectedCategory}"</Text>
          <TouchableOpacity style={styles.sampleBtn} onPress={loadSamples}>
            <Text style={styles.sampleBtnText}>Load Sample Reels</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayedReels}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.reelCard}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <View style={styles.cardCatBadge}>
                    <Text style={styles.cardCatBadgeText}>{item.category}</Text>
                  </View>
                  <Text style={styles.cardUrl} numberOfLines={1}>
                    reel/{item.shortcode}
                  </Text>
                </View>
                <Text style={styles.cardDate}>
                  Added {new Date(item.dateAdded).toLocaleDateString()}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <TouchableOpacity
                  style={styles.playTag}
                  onPress={() => {
                    playReel(item);
                    onPlay();
                  }}
                >
                  <Ionicons name="play" size={13} color={Colors.igPink} style={{ marginRight: 4 }} />
                  <Text style={{ color: Colors.igPink, fontWeight: '700', fontSize: 12 }}>Watch</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.iconCircle}
                  onPress={() => setEditItem(item)}
                >
                  <Ionicons name="pricetag-outline" size={15} color={Colors.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.iconCircle}
                  onPress={() => deleteReel(item.id)}
                >
                  <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}

      {/* Modal: Manage Categories */}
      <Modal visible={showCatModal} transparent animationType="slide" onRequestClose={() => setShowCatModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowCatModal(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.catModalContent}>
              <View style={styles.catModalHeader}>
                <Text style={styles.catModalTitle}>Manage Categories</Text>
                <TouchableOpacity onPress={() => setShowCatModal(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Add New Category Input */}
              <View style={styles.catCreateRow}>
                <TextInput
                  style={styles.catInput}
                  placeholder="e.g. Fitness, Coding, Recipes"
                  placeholderTextColor={Colors.textTertiary}
                  value={newCatName}
                  onChangeText={setNewCatName}
                />
                <TouchableOpacity style={styles.catAddBtn} onPress={handleCreateCategory}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Create</Text>
                </TouchableOpacity>
              </View>

              {/* Existing Categories List */}
              <Text style={styles.catSubheader}>Your Categories:</Text>
              <ScrollView style={{ maxHeight: 220 }}>
                {categories.map((cat) => {
                  const count = reels.filter((r) => r.category === cat).length;
                  return (
                    <View key={cat} style={styles.catItemRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="folder" size={18} color={Colors.igOrange} />
                        <Text style={styles.catItemText}>{cat}</Text>
                        <Text style={styles.catItemCount}>({count} reels)</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            'Delete Category',
                            `Are you sure you want to delete "${cat}"? Reels in it will move to another category.`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => deleteCategory(cat) },
                            ]
                          );
                        }}
                      >
                        <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal: Change Category for a specific Reel */}
      <Modal visible={!!editItem} transparent animationType="fade" onRequestClose={() => setEditItem(null)}>
        <TouchableWithoutFeedback onPress={() => setEditItem(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.catModalContent}>
              <Text style={styles.catModalTitle}>Change Category</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 16 }}>
                Select a new category for reel/{editItem?.shortcode}
              </Text>
              <ScrollView style={{ maxHeight: 200 }}>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.catItemRow,
                      editItem?.category === c && { backgroundColor: Colors.surfaceElevated },
                    ]}
                    onPress={async () => {
                      if (editItem) {
                        await updateReelCategory(editItem.id, c);
                        setEditItem(null);
                      }
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{c}</Text>
                    {editItem?.category === c && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.igPink} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

// --- MAIN CONTENT ---
function MainAppContent() {
  const [tab, setTab] = useState<'reels' | 'links'>('reels');
  const insets = useSafeAreaInsets();
  const bottomBarPadding = Math.max(insets.bottom, 8);

  return (
    <View style={styles.appRoot}>
      <View style={styles.mainViewport}>
        {tab === 'reels' ? (
          <ReelsScreen onGoLinks={() => setTab('links')} />
        ) : (
          <LinksScreen onPlay={() => setTab('reels')} />
        )}
      </View>

      {/* Sleek Bottom Navigation */}
      <View style={[styles.navBar, { paddingBottom: bottomBarPadding }]}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setTab('reels')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={tab === 'reels' ? 'film' : 'film-outline'}
            size={22}
            color={tab === 'reels' ? '#fff' : Colors.textTertiary}
          />
          <Text
            style={[
              styles.navLabel,
              { color: tab === 'reels' ? '#fff' : Colors.textTertiary },
            ]}
          >
            Reels
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setTab('links')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={tab === 'links' ? 'bookmark' : 'bookmark-outline'}
            size={22}
            color={tab === 'links' ? '#fff' : Colors.textTertiary}
          />
          <Text
            style={[
              styles.navLabel,
              { color: tab === 'links' ? '#fff' : Colors.textTertiary },
            ]}
          >
            Links
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- ROOT APP ---
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#000000" translucent={false} />
      <ReelProvider>
        <MainAppContent />
      </ReelProvider>
    </SafeAreaProvider>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  mainViewport: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  viewerContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000000',
  },
  webViewContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    zIndex: 5,
  },
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  categoryPillTop: {
    backgroundColor: Colors.igPink,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryPillTopText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  categoryBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 25,
    height: 42,
  },
  categoryScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  categoryChip: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  categoryChipActive: {
    backgroundColor: Colors.igPink,
    borderColor: Colors.igPink,
  },
  categoryChipText: {
    color: '#ddd',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    zIndex: 20,
  },
  tagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tag: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tagText: {
    color: '#eee',
    fontSize: 12,
    fontWeight: '700',
  },
  counterText: {
    color: '#ccc',
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    paddingVertical: 8,
    marginBottom: 24,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  sheetText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  linksContainer: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 16,
  },
  linksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  manageCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  manageCatBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  inputCard: {
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
  },
  categoryPickerRow: {
    marginTop: 10,
    gap: 6,
  },
  categoryPickerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  miniChip: {
    backgroundColor: Colors.surfaceVariant,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 6,
  },
  miniChipActive: {
    backgroundColor: Colors.igPink,
  },
  miniChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  miniChipTextActive: {
    color: '#fff',
  },
  pasteButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addButton: {
    flex: 1.5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.igPink,
    borderRadius: 10,
    paddingVertical: 10,
  },
  filterTabChip: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  filterTabChipActive: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.igPink,
  },
  filterTabChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterTabChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyBtn: {
    backgroundColor: Colors.igPink,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  emptyBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  sampleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sampleBtnText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  reelCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    alignItems: 'center',
  },
  cardCatBadge: {
    backgroundColor: 'rgba(225,48,108,0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardCatBadgeText: {
    color: Colors.igPink,
    fontSize: 10,
    fontWeight: '700',
  },
  cardUrl: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  cardDate: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  playTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(225,48,108,0.2)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catModalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  catModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  catModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  catCreateRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  catInput: {
    flex: 1,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
  },
  catAddBtn: {
    backgroundColor: Colors.igPink,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 10,
  },
  catSubheader: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  catItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  catItemText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  catItemCount: {
    color: Colors.textTertiary,
    fontSize: 12,
  },
  navBar: {
    minHeight: 52,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: '#000000',
  },
  navItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
  },
  navLabel: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
});
