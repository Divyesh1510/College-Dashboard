package com.example.campusnav.widget

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import campus.nav.gitam.hyd.R
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.ktx.auth
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase
import java.util.Calendar

class TimetableWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return TimetableRemoteViewsFactory(this.applicationContext)
    }
}

class TimetableRemoteViewsFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
    private var timetableList = listOf<TimetableEntry>()

    override fun onCreate() {}

    override fun onDataSetChanged() {
        val user = Firebase.auth.currentUser ?: return
        
        val prefs = context.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE)
        val offset = prefs.getInt("day_offset", 0)

        val calendar = Calendar.getInstance()
        calendar.add(Calendar.DAY_OF_YEAR, offset)
        
        var dayOfWeek = calendar.get(Calendar.DAY_OF_WEEK)
        // Calendar days are 1 (Sun) to 7 (Sat)
        val days = arrayOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
        val targetDay = days[dayOfWeek - 1]

        try {
            val task = Firebase.firestore.collection("timetables")
                .whereEqualTo("userId", user.uid)
                .whereEqualTo("day", targetDay)
                .get()
            
            val snapshot = Tasks.await(task) 
            
            val newList = mutableListOf<TimetableEntry>()
            for (doc in snapshot.documents) {
                val subject = doc.getString("subject") ?: doc.getString("className") ?: "Unknown Class"
                val faculty = doc.getString("faculty") ?: ""
                val title = if (faculty.isNotEmpty()) "$subject ($faculty)" else subject
                
                val startTime = doc.getString("startTime") ?: ""
                val endTime = doc.getString("endTime") ?: ""
                var time = ""
                if (startTime.isNotEmpty() && endTime.isNotEmpty()) {
                    time = "$startTime - $endTime"
                } else {
                    time = doc.getString("time") ?: ""
                }
                
                val location = doc.getString("room") ?: ""
                newList.add(TimetableEntry(title, time, location))
            }
            
            fun parseTimeString(timeStr: String): Int {
                if (timeStr.isEmpty()) return 0
                val regex = Regex("(\\d+):(\\d+)\\s*(AM|PM)?", RegexOption.IGNORE_CASE)
                val match = regex.find(timeStr) ?: return 0
                val (hStr, mStr, ampm) = match.destructured
                var h = hStr.toIntOrNull() ?: 0
                val m = mStr.toIntOrNull() ?: 0
                if (ampm.isNotEmpty()) {
                    if (ampm.equals("PM", ignoreCase = true) && h != 12) h += 12
                    if (ampm.equals("AM", ignoreCase = true) && h == 12) h = 0
                }
                return h * 60 + m
            }
            
            timetableList = newList.sortedBy { parseTimeString(it.time.substringBefore(" - ")) }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onDestroy() {
        timetableList = emptyList()
    }

    override fun getCount(): Int = timetableList.size

    override fun getViewAt(position: Int): RemoteViews {
        val entry = timetableList[position]
        val views = RemoteViews(context.packageName, R.layout.widget_timetable_item)
        views.setTextViewText(R.id.item_title, entry.title)
        views.setTextViewText(R.id.item_time, entry.time)
        views.setTextViewText(R.id.item_location, entry.location)
        
        val fillInIntent = Intent()
        views.setOnClickFillInIntent(R.id.widget_item_root, fillInIntent)
        
        return views
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = true
}
