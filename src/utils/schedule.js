export function findUpcomingClass(scheduleArray) {
  if (!scheduleArray || scheduleArray.length === 0) return null;

  const now = new Date();
  const currentDay = now.getDay();
  
  // Calculate current minutes since midnight for easier comparison
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let upcomingClass = null;
  let minTimeDiff = Infinity;

  scheduleArray.forEach(cls => {
    // Only look at classes for today
    if (cls.dayOfWeek === currentDay) {
      const [hours, minutes] = cls.startTime.split(':').map(Number);
      const classStartMinutes = hours * 60 + minutes;
      
      const timeDiffMins = classStartMinutes - currentMinutes;

      // If class starts in the future and within 15 minutes
      if (timeDiffMins > 0 && timeDiffMins <= 15 && timeDiffMins < minTimeDiff) {
        minTimeDiff = timeDiffMins;
        
        // Construct a proper Date object for the start time
        const startTimeObj = new Date(now);
        startTimeObj.setHours(hours, minutes, 0, 0);

        upcomingClass = {
          ...cls,
          startTime: startTimeObj,
          formattedTime: startTimeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timeUntilMins: timeDiffMins
        };
      }
    }
  });

  return upcomingClass;
}
