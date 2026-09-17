package com.example.campusnav.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "timetables")
data class TimetableEntity(
    @PrimaryKey
    val id: String,
    val userId: String,
    val subject: String,
    val room: String,
    val day: String?,
    val dayOfWeek: Int,
    val startTime: String,
    val endTime: String
)
