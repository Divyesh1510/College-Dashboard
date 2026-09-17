package com.example.campusnav.ui.attendance

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.util.Calendar

@Composable
fun AttendanceScreen(
    modifier: Modifier = Modifier,
    viewModel: AttendanceViewModel = viewModel()
) {
    val attendanceList by viewModel.attendanceList.collectAsState()
    val timetables by viewModel.timetables.collectAsState()

    var totalOverall = 0
    var attendedOverall = 0
    attendanceList.forEach {
        totalOverall += it.totalClasses
        attendedOverall += it.attendedClasses
    }
    
    val overallPercent = if (totalOverall > 0) (attendedOverall.toFloat() / totalOverall * 100) else 0f
    
    // Get Today's classes
    val calendar = Calendar.getInstance()
    val dayOfWeek = calendar.get(Calendar.DAY_OF_WEEK) - 1 // Calendar.SUNDAY is 1, we map to 0-6
    val days = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
    val todayName = days[dayOfWeek]
    
    val todaysClasses = timetables.filter { 
        (it.day?.equals(todayName, ignoreCase = true) == true) || it.dayOfWeek == dayOfWeek 
    }

    LazyColumn(
        modifier = modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(text = "Attendance Manager", style = MaterialTheme.typography.headlineMedium)
            Spacer(modifier = Modifier.height(8.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Overall Attendance", style = MaterialTheme.typography.titleMedium)
                    Text("${String.format("%.1f", overallPercent)}%", style = MaterialTheme.typography.displayMedium)
                    Text("Target: 75%", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        if (todaysClasses.isNotEmpty()) {
            item {
                Text("Today's Schedule", style = MaterialTheme.typography.titleLarge)
            }
            items(todaysClasses) { cls ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(cls.subject, style = MaterialTheme.typography.titleMedium)
                        Text("${cls.startTime} - ${cls.endTime} | ${cls.room}")
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.padding(top = 8.dp)
                        ) {
                            Button(onClick = { 
                                val record = attendanceList.find { it.subject.equals(cls.subject, ignoreCase = true) }
                                if (record != null) viewModel.markAttendance(record, true)
                            }) {
                                Text("Attended")
                            }
                            OutlinedButton(onClick = { 
                                val record = attendanceList.find { it.subject.equals(cls.subject, ignoreCase = true) }
                                if (record != null) viewModel.markAttendance(record, false)
                            }) {
                                Text("Missed")
                            }
                        }
                    }
                }
            }
        }

        item {
            Text("Subjects", style = MaterialTheme.typography.titleLarge)
        }
        
        items(attendanceList) { item ->
            val pct = if (item.totalClasses > 0) (item.attendedClasses.toFloat() / item.totalClasses * 100) else 0f
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text(item.subject, style = MaterialTheme.typography.titleMedium)
                        Text("Attended: ${item.attendedClasses}/${item.totalClasses}")
                    }
                    Text("${String.format("%.1f", pct)}%", style = MaterialTheme.typography.titleLarge)
                }
            }
        }
    }
}
