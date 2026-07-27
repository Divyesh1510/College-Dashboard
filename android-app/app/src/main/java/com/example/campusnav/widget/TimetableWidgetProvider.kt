package com.example.campusnav.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import campus.nav.gitam.hyd.R
import com.example.campusnav.MainActivity

class TimetableWidgetProvider : AppWidgetProvider() {
    companion object {
        const val ACTION_NEXT_DAY = "com.example.campusnav.widget.ACTION_NEXT_DAY"
        const val ACTION_PREV_DAY = "com.example.campusnav.widget.ACTION_PREV_DAY"
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val prefs = context.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE)
        val offset = prefs.getInt("day_offset", 0)

        for (appWidgetId in appWidgetIds) {
            val intent = Intent(context, TimetableWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }

            val views = RemoteViews(context.packageName, R.layout.widget_timetable).apply {
                setRemoteAdapter(R.id.widget_list, intent)
                setEmptyView(R.id.widget_list, R.id.widget_empty_view)
                
                val calendar = java.util.Calendar.getInstance()
                calendar.add(java.util.Calendar.DAY_OF_YEAR, offset)
                val days = arrayOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
                val dayName = days[calendar.get(java.util.Calendar.DAY_OF_WEEK) - 1]
                
                val title = if (offset == 0) "Today's Classes" else if (offset == 1) "Tomorrow's Classes" else if (offset == -1) "Yesterday's Classes" else "$dayName's Classes"
                setTextViewText(R.id.widget_title, title)

                val nextIntent = Intent(context, TimetableWidgetProvider::class.java).apply { action = ACTION_NEXT_DAY }
                val nextPendingIntent = PendingIntent.getBroadcast(context, 0, nextIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                setOnClickPendingIntent(R.id.widget_btn_next, nextPendingIntent)

                val prevIntent = Intent(context, TimetableWidgetProvider::class.java).apply { action = ACTION_PREV_DAY }
                val prevPendingIntent = PendingIntent.getBroadcast(context, 1, prevIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                setOnClickPendingIntent(R.id.widget_btn_prev, prevPendingIntent)

                // Launch app on widget root click
                val mainIntent = Intent(context, MainActivity::class.java).apply {
                    putExtra("target_tab", "timetable")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val mainPendingIntent = PendingIntent.getActivity(
                    context, 2, mainIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                setOnClickPendingIntent(R.id.widget_root, mainPendingIntent)

                // Set template for list items
                val templateIntent = Intent(context, MainActivity::class.java).apply {
                    putExtra("target_tab", "timetable")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val templatePendingIntent = PendingIntent.getActivity(
                    context, 3, templateIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                )
                setPendingIntentTemplate(R.id.widget_list, templatePendingIntent)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_NEXT_DAY || intent.action == ACTION_PREV_DAY) {
            val prefs = context.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE)
            var offset = prefs.getInt("day_offset", 0)
            
            if (intent.action == ACTION_NEXT_DAY) offset++
            if (intent.action == ACTION_PREV_DAY) offset--
            
            prefs.edit().putInt("day_offset", offset).apply()

            val appWidgetManager = AppWidgetManager.getInstance(context)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(ComponentName(context, TimetableWidgetProvider::class.java))
            
            // Trigger update
            onUpdate(context, appWidgetManager, appWidgetIds)
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_list)
        }
    }
}
