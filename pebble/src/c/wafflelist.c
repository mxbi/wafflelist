/* Wafflelist for Pebble - inbox view.
 *
 * Row 0 starts dictation to add a todo; double-press SELECT on a todo to
 * mark it done; long-press SELECT to refresh. All crypto/networking lives
 * in the PebbleKit JS component - this side only shows plaintext titles.
 */

#include <pebble.h>

#define MAX_TODOS 20   // must match MAX_ITEMS in pkjs/index.js
#define MAX_TITLE 48   // bytes incl. NUL; JS truncates titles to fit
#define DOUBLE_PRESS_MS 500

static Window *s_window;
static MenuLayer *s_menu;

static char s_titles[MAX_TODOS][MAX_TITLE];
static int s_count = 0;
static char s_status[80] = "Connecting...";

static DictationSession *s_dictation;
static char s_dictation_text[256];

// Double-press detection
static AppTimer *s_press_timer;
static int s_pending_row = -1;

// Single retry slot for outgoing messages
static struct {
  bool valid;
  bool is_string;
  uint32_t key;
  int32_t int_value;
  char str_value[256];
  int retries;
} s_outgoing;

/* ---------------- outgoing messages ---------------- */

static void prv_try_send(void *context);

static void prv_send(void) {
  if (!s_outgoing.valid) {
    return;
  }
  DictionaryIterator *out;
  if (app_message_outbox_begin(&out) != APP_MSG_OK) {
    app_timer_register(250, prv_try_send, NULL);
    return;
  }
  if (s_outgoing.is_string) {
    dict_write_cstring(out, s_outgoing.key, s_outgoing.str_value);
  } else {
    dict_write_int32(out, s_outgoing.key, s_outgoing.int_value);
  }
  app_message_outbox_send();
}

static void prv_try_send(void *context) {
  prv_send();
}

static void prv_send_int(uint32_t key, int32_t value) {
  s_outgoing.valid = true;
  s_outgoing.is_string = false;
  s_outgoing.key = key;
  s_outgoing.int_value = value;
  s_outgoing.retries = 0;
  prv_send();
}

static void prv_send_string(uint32_t key, const char *str) {
  s_outgoing.valid = true;
  s_outgoing.is_string = true;
  s_outgoing.key = key;
  strncpy(s_outgoing.str_value, str, sizeof(s_outgoing.str_value) - 1);
  s_outgoing.str_value[sizeof(s_outgoing.str_value) - 1] = '\0';
  s_outgoing.retries = 0;
  prv_send();
}

static void prv_outbox_sent(DictionaryIterator *iter, void *context) {
  s_outgoing.valid = false;
}

static void prv_outbox_failed(DictionaryIterator *iter, AppMessageResult reason, void *context) {
  if (s_outgoing.valid && ++s_outgoing.retries < 3) {
    app_timer_register(250, prv_try_send, NULL);
  } else {
    s_outgoing.valid = false;
  }
}

/* ---------------- double-press handling ---------------- */

static void prv_press_timeout(void *context) {
  s_press_timer = NULL;
  s_pending_row = -1;
}

static void prv_reset_press(void) {
  if (s_press_timer) {
    app_timer_cancel(s_press_timer);
    s_press_timer = NULL;
  }
  s_pending_row = -1;
}

/* ---------------- dictation ---------------- */

static void prv_dictation_callback(DictationSession *session, DictationSessionStatus status,
                                   char *transcription, void *context) {
  if (status == DictationSessionStatusSuccess && transcription && transcription[0]) {
    prv_send_string(MESSAGE_KEY_AddTodo, transcription);
  }
}

static void prv_start_dictation(void) {
#if defined(PBL_MICROPHONE)
  if (!s_dictation) {
    s_dictation = dictation_session_create(sizeof(s_dictation_text), prv_dictation_callback, NULL);
  }
  if (s_dictation) {
    dictation_session_start(s_dictation);
  }
#else
  strncpy(s_status, "No microphone on this watch", sizeof(s_status) - 1);
  menu_layer_reload_data(s_menu);
#endif
}

/* ---------------- menu ---------------- */

static uint16_t prv_get_num_rows(MenuLayer *menu, uint16_t section, void *context) {
  // Row 0 is "+ New todo"; with no todos, one extra row shows the status.
  return 1 + (s_count > 0 ? s_count : 1);
}

static int16_t prv_get_cell_height(MenuLayer *menu, MenuIndex *idx, void *context) {
  if (idx->row == 0) {
    return 36;
  }
  if (s_count == 0) {
    return 64; // status row, room to wrap
  }
  return 48; // two lines of GOTHIC_18_BOLD
}

static void prv_draw_row(GContext *ctx, const Layer *cell_layer, MenuIndex *idx, void *context) {
  GRect bounds = layer_get_bounds(cell_layer);
  graphics_context_set_text_color(ctx, menu_cell_layer_is_highlighted(cell_layer) ? GColorWhite : GColorBlack);

  if (idx->row == 0) {
    graphics_draw_text(ctx, "+ New todo", fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
                       GRect(8, -2, bounds.size.w - 16, bounds.size.h),
                       GTextOverflowModeTrailingEllipsis,
                       PBL_IF_ROUND_ELSE(GTextAlignmentCenter, GTextAlignmentLeft), NULL);
    return;
  }

  if (s_count == 0) {
    graphics_draw_text(ctx, s_status, fonts_get_system_font(FONT_KEY_GOTHIC_18),
                       GRect(8, 2, bounds.size.w - 16, bounds.size.h - 4),
                       GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
    return;
  }

  int row = idx->row - 1;
  if (row >= s_count) {
    return;
  }
  const char *title = s_titles[row][0] ? s_titles[row] : "...";
  graphics_draw_text(ctx, title, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD),
                     GRect(8, 0, bounds.size.w - 16, bounds.size.h),
                     GTextOverflowModeWordWrap,
                     PBL_IF_ROUND_ELSE(GTextAlignmentCenter, GTextAlignmentLeft), NULL);
}

static void prv_complete_row(int row) {
  prv_send_int(MESSAGE_KEY_Complete, row);

  // Optimistic removal; phone keeps its index list in sync and only
  // re-sends the full list on conflicts/refresh.
  for (int i = row; i < s_count - 1; i++) {
    strncpy(s_titles[i], s_titles[i + 1], MAX_TITLE);
    s_titles[i][MAX_TITLE - 1] = '\0';
  }
  s_count--;
  if (s_count == 0) {
    strncpy(s_status, "Inbox empty", sizeof(s_status) - 1);
  }
  vibes_short_pulse();
  menu_layer_reload_data(s_menu);
}

static void prv_select_click(MenuLayer *menu, MenuIndex *idx, void *context) {
  if (idx->row == 0) {
    prv_reset_press();
    prv_start_dictation();
    return;
  }
  if (s_count == 0) {
    return;
  }
  int row = idx->row - 1;
  if (s_pending_row == row) {
    // Second press within the window: mark as done.
    prv_reset_press();
    prv_complete_row(row);
  } else {
    prv_reset_press();
    s_pending_row = row;
    s_press_timer = app_timer_register(DOUBLE_PRESS_MS, prv_press_timeout, NULL);
  }
}

static void prv_select_long_click(MenuLayer *menu, MenuIndex *idx, void *context) {
  prv_reset_press();
  strncpy(s_status, "Refreshing...", sizeof(s_status) - 1);
  if (s_count == 0) {
    menu_layer_reload_data(s_menu);
  }
  prv_send_int(MESSAGE_KEY_Request, 1);
}

/* ---------------- incoming messages ---------------- */

static void prv_inbox_received(DictionaryIterator *iter, void *context) {
  Tuple *t;

  if ((t = dict_find(iter, MESSAGE_KEY_Status)) && t->value->cstring[0]) {
    strncpy(s_status, t->value->cstring, sizeof(s_status) - 1);
    s_status[sizeof(s_status) - 1] = '\0';
  }

  if ((t = dict_find(iter, MESSAGE_KEY_Count))) {
    int count = t->value->int32;
    if (count < 0) count = 0;
    if (count > MAX_TODOS) count = MAX_TODOS;
    s_count = count;
    for (int i = 0; i < s_count; i++) {
      s_titles[i][0] = '\0';
    }
    prv_reset_press();
  }

  if ((t = dict_find(iter, MESSAGE_KEY_Index))) {
    int i = t->value->int32;
    Tuple *title = dict_find(iter, MESSAGE_KEY_Title);
    if (title && i >= 0 && i < s_count) {
      strncpy(s_titles[i], title->value->cstring, MAX_TITLE - 1);
      s_titles[i][MAX_TITLE - 1] = '\0';
    }
  }

  menu_layer_reload_data(s_menu);
}

/* ---------------- window ---------------- */

static void prv_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_menu = menu_layer_create(bounds);
  menu_layer_set_callbacks(s_menu, NULL, (MenuLayerCallbacks) {
    .get_num_rows = prv_get_num_rows,
    .get_cell_height = prv_get_cell_height,
    .draw_row = prv_draw_row,
    .select_click = prv_select_click,
    .select_long_click = prv_select_long_click,
  });
#if defined(PBL_COLOR)
  menu_layer_set_highlight_colors(s_menu, GColorWindsorTan, GColorWhite);
#endif
  menu_layer_set_click_config_onto_window(s_menu, window);
  layer_add_child(window_layer, menu_layer_get_layer(s_menu));
}

static void prv_window_unload(Window *window) {
  menu_layer_destroy(s_menu);
}

static void prv_init(void) {
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load,
    .unload = prv_window_unload,
  });
  window_stack_push(s_window, true);

  app_message_register_inbox_received(prv_inbox_received);
  app_message_register_outbox_sent(prv_outbox_sent);
  app_message_register_outbox_failed(prv_outbox_failed);
  app_message_open(512, 512);
}

static void prv_deinit(void) {
  if (s_dictation) {
    dictation_session_destroy(s_dictation);
  }
  window_destroy(s_window);
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
  return 0;
}
