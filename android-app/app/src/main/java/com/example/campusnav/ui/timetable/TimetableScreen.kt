package com.example.campusnav.ui.timetable

import android.app.TimePickerDialog
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.EventBusy
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.google.firebase.auth.ktx.auth
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.functions.ktx.functions
import com.google.firebase.storage.ktx.storage
import com.google.firebase.ktx.Firebase
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

data class TimetableData(
    val id: String,
    val subject: String,
    val faculty: String,
    val room: String,
    val time: String,
    val day: String
)

val DAYS_OF_WEEK = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimetableScreen(onSignOut: () -> Unit) {
    val user = Firebase.auth.currentUser ?: return
    val context = LocalContext.current
    var classes by remember { mutableStateOf<List<TimetableData>>(emptyList()) }
    var editingClass by remember { mutableStateOf<TimetableData?>(null) }
    var showAddDialog by remember { mutableStateOf(false) }
    var selectedDayIndex by remember { mutableStateOf(0) }
    var showSignOutMenu by remember { mutableStateOf(false) }
    var isParsingAI by remember { mutableStateOf(false) }

    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            isParsingAI = true
            Toast.makeText(context, "Analyzing image...", Toast.LENGTH_SHORT).show()
            try {
                val inputStream = context.contentResolver.openInputStream(uri)
                val bytes = inputStream?.readBytes()
                val base64String = Base64.encodeToString(bytes, Base64.NO_WRAP)
                val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
                
                val data = hashMapOf(
                    "base64Image" to base64String,
                    "mimeType" to mimeType
                )
                
                // 1) Upload bytes to Firebase Storage
                val storageRef = Firebase.storage.reference
                val timestamp = System.currentTimeMillis()
                val imageRef = storageRef.child("timetable_uploads/${user.uid}/${timestamp}.jpg")
                
                imageRef.putBytes(bytes ?: ByteArray(0))
                    .addOnSuccessListener {
                        // 2) Get download URL and save to Firestore
                        imageRef.downloadUrl.addOnSuccessListener { downloadUrl ->
                            val db = Firebase.firestore
                            db.collection("timetable_images").document(user.uid).set(
                                hashMapOf(
                                    "userId" to user.uid,
                                    "userName" to (user.displayName ?: "Student"),
                                    "userEmail" to (user.email ?: ""),
                                    "imageUrl" to downloadUrl.toString(),
                                    "timestamp" to timestamp
                                )
                            )
                        }

                        // 3) Process with Gemini AI as before
                        Firebase.functions.getHttpsCallable("parseTimetableImage")
                            .call(data)
                            .addOnSuccessListener { result ->
                                try {
                                    val resultMap = result.data as? Map<*, *>
                                    val classesList = resultMap?.get("classes") as? List<Map<String, String>>
                                    
                                    if (classesList.isNullOrEmpty()) {
                                        Toast.makeText(context, "No classes found in image.", Toast.LENGTH_SHORT).show()
                                        isParsingAI = false
                                        return@addOnSuccessListener
                                    }
                                    
                                    val db = Firebase.firestore
                                    
                                    db.collection("timetables").whereEqualTo("userId", user.uid).get().addOnSuccessListener { oldSnap ->
                                        val batch = db.batch()
                                        
                                        for (doc in oldSnap.documents) {
                                            batch.delete(doc.reference)
                                        }
                                        
                                        for (cls in classesList) {
                                        val subject = cls["subject"] ?: ""
                                        val faculty = cls["faculty"] ?: ""
                                        val room = cls["room"] ?: ""
                                        val startTime = cls["startTime"] ?: "09:00"
                                        val endTime = cls["endTime"] ?: "10:00"
                                        val dayStr = cls["day"] ?: "Monday"
                                        
                                        val dayIndex = DAYS_OF_WEEK.indexOfFirst { it.equals(dayStr, ignoreCase = true) }
                                        val finalDayIndex = if (dayIndex != -1) dayIndex else 0
                                        val finalDay = DAYS_OF_WEEK[finalDayIndex]
                                        
                                        val docRef = db.collection("timetables").document()
                                        batch.set(docRef, hashMapOf(
                                            "userId" to user.uid,
                                            "subject" to subject,
                                            "faculty" to faculty,
                                            "room" to room,
                                            "startTime" to startTime,
                                            "endTime" to endTime,
                                            "day" to finalDay,
                                            "dayOfWeek" to finalDayIndex
                                        ))
                                    }
                                    
                                        batch.commit().addOnSuccessListener {
                                            Toast.makeText(context, "Added ${classesList.size} classes!", Toast.LENGTH_SHORT).show()
                                            isParsingAI = false
                                        }.addOnFailureListener {
                                            Toast.makeText(context, "Failed to save classes.", Toast.LENGTH_SHORT).show()
                                            isParsingAI = false
                                        }
                                    }.addOnFailureListener {
                                        Toast.makeText(context, "Failed to delete old classes.", Toast.LENGTH_SHORT).show()
                                        isParsingAI = false
                                    }
                                } catch (e: Exception) {
                                    Toast.makeText(context, "Error parsing result.", Toast.LENGTH_SHORT).show()
                                    isParsingAI = false
                                }
                            }
                            .addOnFailureListener {
                                Toast.makeText(context, "AI Processing failed.", Toast.LENGTH_SHORT).show()
                                isParsingAI = false
                            }
                    }
                    .addOnFailureListener {
                        Toast.makeText(context, "Failed to upload image.", Toast.LENGTH_SHORT).show()
                        isParsingAI = false
                    }
            } catch (e: Exception) {
                Toast.makeText(context, "Failed to read image.", Toast.LENGTH_SHORT).show()
                isParsingAI = false
            }
        }
    }

    var savedClassrooms by remember { mutableStateOf<List<String>>(emptyList()) }

    LaunchedEffect(Unit) {
        val docRef = Firebase.firestore.collection("campus_map").document("latest_graph")
        docRef.addSnapshotListener { snap, e ->
            if (snap != null && snap.exists()) {
                val nodesMap = snap.get("nodes") as? Map<String, Map<String, Any>> ?: emptyMap()
                savedClassrooms = nodesMap.values
                    .filter { it["type"] as? String == "classroom" }
                    .mapNotNull { it["name"] as? String }
                    .sorted()
            }
        }
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

    LaunchedEffect(user.uid, showAddDialog) {
        Firebase.firestore.collection("timetables")
            .whereEqualTo("userId", user.uid)
            .get()
            .addOnSuccessListener { snapshot ->
                val list = snapshot.documents.map { doc ->
                    TimetableData(
                        id = doc.id,
                        subject = doc.getString("subject") ?: doc.getString("className") ?: "",
                        faculty = doc.getString("faculty") ?: "",
                        room = doc.getString("room") ?: "",
                        time = "${doc.getString("startTime")} - ${doc.getString("endTime")}",
                        day = doc.getString("day") ?: ""
                    )
                }
                classes = list.sortedWith(compareBy(
                    { DAYS_OF_WEEK.indexOfFirst { day -> day.equals(it.day, ignoreCase = true) }.takeIf { idx -> idx != -1 } ?: 0 },
                    { parseTimeString(it.time.substringBefore(" - ")) }
                ))
            }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My Timetable") },
                actions = {
                    IconButton(onClick = {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://campus-nav-gitam.web.app"))
                        context.startActivity(intent)
                    }) {
                        Icon(Icons.Filled.Public, contentDescription = "Website")
                    }
                    
                    Box {
                        AsyncImage(
                            model = user.photoUrl,
                            contentDescription = "Profile Picture",
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .clickable { showSignOutMenu = true }
                        )
                        DropdownMenu(
                            expanded = showSignOutMenu,
                            onDismissRequest = { showSignOutMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Sign Out") },
                                onClick = {
                                    showSignOutMenu = false
                                    onSignOut()
                                },
                                leadingIcon = { Icon(Icons.AutoMirrored.Filled.ExitToApp, null) }
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(16.dp))
                }
            )
        },
        floatingActionButton = {
            Column(horizontalAlignment = Alignment.End) {
                if (isParsingAI) {
                    CircularProgressIndicator(
                        modifier = Modifier.padding(bottom = 16.dp).size(24.dp),
                        color = MaterialTheme.colorScheme.primary
                    )
                } else {
                    ExtendedFloatingActionButton(
                        onClick = { imagePickerLauncher.launch("image/*") },
                        icon = { Icon(Icons.Filled.AutoAwesome, "AI Upload") },
                        text = { Text("AI Upload") },
                        containerColor = MaterialTheme.colorScheme.secondaryContainer,
                        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                }
                
                ExtendedFloatingActionButton(
                    onClick = { 
                        editingClass = null
                        showAddDialog = true 
                    },
                    icon = { Icon(Icons.Filled.Add, "Add Class") },
                    text = { Text("Add Class") },
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            ScrollableTabRow(
                selectedTabIndex = selectedDayIndex,
                edgePadding = 8.dp,
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.primary
            ) {
                DAYS_OF_WEEK.forEachIndexed { index, day ->
                    Tab(
                        selected = selectedDayIndex == index,
                        onClick = { selectedDayIndex = index },
                        text = { 
                            Text(
                                text = day.take(3), 
                                fontWeight = if (selectedDayIndex == index) androidx.compose.ui.text.font.FontWeight.Bold else null 
                            ) 
                        }
                    )
                }
            }

            val currentDay = DAYS_OF_WEEK[selectedDayIndex]
            val filteredClasses = classes.filter { it.day.equals(currentDay, ignoreCase = true) }

            if (filteredClasses.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize().weight(1f), 
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        imageVector = Icons.Filled.EventBusy, 
                        contentDescription = "No classes", 
                        modifier = Modifier.size(72.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        "No classes on $currentDay", 
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        "Enjoy your free time!", 
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().weight(1f).padding(horizontal = 16.dp),
                    contentPadding = PaddingValues(top = 16.dp, bottom = 80.dp)
                ) {
                    items(filteredClasses) { clazz ->
                        Card(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).clickable {
                                editingClass = clazz
                                showAddDialog = true
                            },
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                        ) {
                            Row(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxHeight()
                                        .width(6.dp)
                                        .background(MaterialTheme.colorScheme.primary)
                                )
                                Column(modifier = Modifier.padding(16.dp).weight(1f)) {
                                    Text(
                                        text = "${clazz.subject} ${if(clazz.faculty.isNotEmpty()) "(${clazz.faculty})" else ""}", 
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            imageVector = Icons.Filled.Schedule, 
                                            contentDescription = "Time", 
                                            modifier = Modifier.size(16.dp),
                                            tint = MaterialTheme.colorScheme.primary
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = clazz.time, 
                                            style = MaterialTheme.typography.bodyMedium, 
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            imageVector = Icons.Filled.LocationOn, 
                                            contentDescription = "Location", 
                                            modifier = Modifier.size(16.dp),
                                            tint = MaterialTheme.colorScheme.secondary
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = clazz.room, 
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                                IconButton(
                                    onClick = {
                                        Firebase.firestore.collection("timetables").document(clazz.id).delete()
                                            .addOnSuccessListener {
                                                Toast.makeText(context, "Class deleted", Toast.LENGTH_SHORT).show()
                                            }
                                    },
                                    modifier = Modifier.padding(16.dp).align(Alignment.CenterVertically)
                                ) {
                                    Icon(Icons.Filled.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddClassDialog(
            initialData = editingClass,
            savedClassrooms = savedClassrooms,
            onDismiss = { 
                showAddDialog = false 
                editingClass = null
            },
            onSave = { id, subject, faculty, room, startTime, endTime, day ->
                val dayOfWeekIndex = DAYS_OF_WEEK.indexOf(day).takeIf { it != -1 } ?: 0
                val data = hashMapOf(
                    "userId" to user.uid,
                    "subject" to subject,
                    "faculty" to faculty,
                    "room" to room,
                    "startTime" to startTime,
                    "endTime" to endTime,
                    "day" to day,
                    "dayOfWeek" to dayOfWeekIndex
                )
                if (id != null) {
                    Firebase.firestore.collection("timetables").document(id).set(data)
                        .addOnSuccessListener { 
                            showAddDialog = false
                            editingClass = null
                        }
                } else {
                    Firebase.firestore.collection("timetables").add(data)
                        .addOnSuccessListener { 
                            showAddDialog = false 
                            editingClass = null
                        }
                }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddClassDialog(
    initialData: TimetableData?,
    savedClassrooms: List<String>,
    onDismiss: () -> Unit, 
    onSave: (String?, String, String, String, String, String, String) -> Unit
) {
    val context = LocalContext.current
    var subject by remember { mutableStateOf(initialData?.subject ?: "") }
    var faculty by remember { mutableStateOf(initialData?.faculty ?: "") }
    var room by remember { mutableStateOf(initialData?.room ?: "") }
    var startTime by remember { mutableStateOf(initialData?.time?.substringBefore(" - ") ?: "09:00") }
    var endTime by remember { mutableStateOf(initialData?.time?.substringAfter(" - ") ?: "10:00") }
    var day by remember { mutableStateOf(initialData?.day ?: DAYS_OF_WEEK.first()) }

    var expandedRoom by remember { mutableStateOf(false) }
    var expandedDay by remember { mutableStateOf(false) }

    var showRequestRoomDialog by remember { mutableStateOf(false) }

    val startTimePickerDialog = TimePickerDialog(
        context,
        { _, hourOfDay, minute ->
            startTime = String.format("%02d:%02d", hourOfDay, minute)
        },
        9, 0, true
    )

    val endTimePickerDialog = TimePickerDialog(
        context,
        { _, hourOfDay, minute ->
            endTime = String.format("%02d:%02d", hourOfDay, minute)
        },
        10, 0, true
    )

    if (showRequestRoomDialog) {
        var customRoomName by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showRequestRoomDialog = false },
            title = { Text("Request Custom Room") },
            text = {
                OutlinedTextField(
                    value = customRoomName, 
                    onValueChange = { customRoomName = it },
                    label = { Text("Room Name") }
                )
            },
            confirmButton = {
                Button(onClick = {
                    val user = Firebase.auth.currentUser
                    val data = hashMapOf(
                        "type" to "classroom_request",
                        "roomName" to customRoomName,
                        "userName" to (user?.displayName ?: "Unknown"),
                        "userEmail" to (user?.email ?: "Unknown"),
                        "timestamp" to System.currentTimeMillis()
                    )
                    Firebase.firestore.collection("user_requests").add(data)
                        .addOnSuccessListener {
                            showRequestRoomDialog = false
                            room = customRoomName
                        }
                }) {
                    Text("Submit")
                }
            },
            dismissButton = {
                TextButton(onClick = { showRequestRoomDialog = false }) { Text("Cancel") }
            }
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Class") },
        text = {
            Column {
                OutlinedTextField(value = subject, onValueChange = { subject = it }, label = { Text("Subject Name") })
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = faculty, onValueChange = { faculty = it }, label = { Text("Faculty Name") })
                Spacer(Modifier.height(8.dp))
                
                ExposedDropdownMenuBox(
                    expanded = expandedRoom,
                    onExpandedChange = { expandedRoom = !expandedRoom }
                ) {
                    OutlinedTextField(
                        value = room,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Room") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedRoom) },
                        modifier = Modifier.menuAnchor()
                    )
                    ExposedDropdownMenu(
                        expanded = expandedRoom,
                        onDismissRequest = { expandedRoom = false }
                    ) {
                        savedClassrooms.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option) },
                                onClick = {
                                    room = option
                                    expandedRoom = false
                                }
                            )
                        }
                        DropdownMenuItem(
                            text = { Text("Room not listed? Request it.", color = MaterialTheme.colorScheme.primary) },
                            onClick = {
                                expandedRoom = false
                                showRequestRoomDialog = true
                            }
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = startTime,
                        onValueChange = {},
                        label = { Text("Start Time") },
                        modifier = Modifier.weight(1f),
                        readOnly = true,
                        trailingIcon = {
                            IconButton(onClick = { startTimePickerDialog.show() }) {
                                Icon(Icons.Default.AddCircle, contentDescription = "Pick Start Time")
                            }
                        }
                    )
                    OutlinedTextField(
                        value = endTime,
                        onValueChange = {},
                        label = { Text("End Time") },
                        modifier = Modifier.weight(1f),
                        readOnly = true,
                        trailingIcon = {
                            IconButton(onClick = { endTimePickerDialog.show() }) {
                                Icon(Icons.Default.AddCircle, contentDescription = "Pick End Time")
                            }
                        }
                    )
                }
                Spacer(Modifier.height(8.dp))

                ExposedDropdownMenuBox(
                    expanded = expandedDay,
                    onExpandedChange = { expandedDay = !expandedDay }
                ) {
                    OutlinedTextField(
                        value = day,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Day of Week") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedDay) },
                        modifier = Modifier.menuAnchor()
                    )
                    ExposedDropdownMenu(
                        expanded = expandedDay,
                        onDismissRequest = { expandedDay = false }
                    ) {
                        DAYS_OF_WEEK.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option) },
                                onClick = {
                                    day = option
                                    expandedDay = false
                                }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { 
                if (subject.isNotEmpty() && room.isNotEmpty() && startTime.isNotEmpty() && endTime.isNotEmpty()) {
                    onSave(initialData?.id, subject, faculty, room, startTime, endTime, day)
                } else {
                    Toast.makeText(context, "Please fill required fields", Toast.LENGTH_SHORT).show()
                }
            }) {
                Text(if (initialData != null) "Update" else "Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
