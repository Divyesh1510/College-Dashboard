package com.example.campusnav.ui.attendance

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.campusnav.data.local.AppDatabase
import com.example.campusnav.data.local.TimetableEntity
import com.google.firebase.auth.ktx.auth
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

data class AttendanceRecord(
    val id: String = "",
    val subject: String = "",
    val totalClasses: Int = 0,
    val attendedClasses: Int = 0
)

class AttendanceViewModel(application: Application) : AndroidViewModel(application) {
    private val db = Firebase.firestore
    private val auth = Firebase.auth
    private val roomDao = AppDatabase.getDatabase(application).timetableDao()

    private val _attendanceList = MutableStateFlow<List<AttendanceRecord>>(emptyList())
    val attendanceList: StateFlow<List<AttendanceRecord>> = _attendanceList.asStateFlow()

    private val _timetables = MutableStateFlow<List<TimetableEntity>>(emptyList())
    val timetables: StateFlow<List<TimetableEntity>> = _timetables.asStateFlow()

    init {
        fetchData()
        observeTimetables()
    }

    private fun fetchData() {
        val userId = auth.currentUser?.uid ?: return
        viewModelScope.launch {
            try {
                // Fetch attendance
                val snap = db.collection("attendance").whereEqualTo("userId", userId).get().await()
                val list = snap.documents.mapNotNull { doc ->
                    doc.toObject(AttendanceRecord::class.java)?.copy(id = doc.id)
                }
                _attendanceList.value = list

                // Fetch timetables & sync to Room
                val ttSnap = db.collection("timetables").whereEqualTo("userId", userId).get().await()
                val ttList = ttSnap.documents.mapNotNull { doc ->
                    val data = doc.data ?: return@mapNotNull null
                    TimetableEntity(
                        id = doc.id,
                        userId = userId,
                        subject = data["subject"] as? String ?: "",
                        room = data["room"] as? String ?: "",
                        day = data["day"] as? String,
                        dayOfWeek = (data["dayOfWeek"] as? Number)?.toInt() ?: 0,
                        startTime = data["startTime"] as? String ?: "",
                        endTime = data["endTime"] as? String ?: ""
                    )
                }
                roomDao.insertTimetables(ttList)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun observeTimetables() {
        val userId = auth.currentUser?.uid ?: return
        viewModelScope.launch {
            roomDao.getTimetablesForUser(userId).collect {
                _timetables.value = it
            }
        }
    }

    fun markAttendance(record: AttendanceRecord, attended: Boolean) {
        val newTotal = record.totalClasses + 1
        val newAttended = if (attended) record.attendedClasses + 1 else record.attendedClasses
        
        viewModelScope.launch {
            try {
                db.collection("attendance").document(record.id).update(
                    "totalClasses", newTotal,
                    "attendedClasses", newAttended
                ).await()
                
                // Update local state immediately for better UX
                val updatedList = _attendanceList.value.map {
                    if (it.id == record.id) it.copy(totalClasses = newTotal, attendedClasses = newAttended) else it
                }
                _attendanceList.value = updatedList
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
