package com.lazyportal.juet;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class AttendanceWidgetProvider extends AppWidgetProvider {
    public static final String PREFS_NAME = "juet_widget_prefs";
    public static final String KEY_PERCENTAGE = "widget_pct";
    public static final String KEY_CLASSES = "widget_classes";
    public static final String KEY_STATUS = "widget_status";
    public static final String KEY_SAFE = "widget_is_safe";
    public static final String KEY_UPDATED = "widget_updated";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String pct = prefs.getString(KEY_PERCENTAGE, "--%");
        String classes = prefs.getString(KEY_CLASSES, "Open app to sync");
        String status = prefs.getString(KEY_STATUS, "Attendance Tracker");
        String updated = prefs.getString(KEY_UPDATED, "Tap to open");
        boolean isSafe = prefs.getBoolean(KEY_SAFE, true);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.attendance_widget_layout);
        views.setTextViewText(R.id.widget_pct, pct);
        views.setTextViewText(R.id.widget_classes, classes);
        views.setTextViewText(R.id.widget_status, status);
        views.setTextViewText(R.id.widget_updated, updated);

        if (isSafe) {
            views.setTextColor(R.id.widget_status, 0xFF34D399);
        } else {
            views.setTextColor(R.id.widget_status, 0xFFFB7185);
        }

        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_container, pendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    public static void saveAndBroadcast(Context context, String pct, String classes, String status, boolean isSafe) {
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit();
        editor.putString(KEY_PERCENTAGE, pct);
        editor.putString(KEY_CLASSES, classes);
        editor.putString(KEY_STATUS, status);
        editor.putBoolean(KEY_SAFE, isSafe);
        editor.putString(KEY_UPDATED, "Live synced");
        editor.apply();

        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName thisWidget = new ComponentName(context, AttendanceWidgetProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
        if (appWidgetIds != null && appWidgetIds.length > 0) {
            for (int id : appWidgetIds) {
                updateAppWidget(context, appWidgetManager, id);
            }
        }
    }
}
