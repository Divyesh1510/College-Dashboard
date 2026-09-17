package com.example.campusnav.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface TimetableDao {
    @Query("SELECT * FROM timetables WHERE userId = :userId")
    fun getTimetablesForUser(userId: String): Flow<List<TimetableEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTimetables(timetables: List<TimetableEntity>)

    @Query("DELETE FROM timetables WHERE userId = :userId")
    suspend fun deleteTimetablesForUser(userId: String)
}
