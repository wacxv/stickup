use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, NaiveDateTime, TimeZone};
use serde_json::Value;
use std::{fs, path::PathBuf, thread, time::Duration as StdDuration};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;

const TICK: StdDuration = StdDuration::from_secs(60);

pub fn start<R: Runtime>(app: AppHandle<R>) {
    thread::spawn(move || loop {
        if let Err(error) = check(&app) {
            eprintln!("[background] check failed: {error}");
        }
        thread::sleep(TICK);
    });
}

pub fn check<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let root = app
        .path()
        .app_data_dir()?
        .parent()
        .ok_or("app data directory has no parent")?
        .join("StickUp");
    let settings = read_settings(&root.join("settings.json"));
    let boards = root.join("boards");

    for entry in fs::read_dir(boards)? {
        let path = entry?.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        let raw = fs::read_to_string(&path)?;
        let Some(tasks_line) = raw.lines().find(|line| line.starts_with("tasks:")) else {
            continue;
        };
        let mut tasks: Vec<Value> =
            serde_json::from_str(tasks_line.trim_start_matches("tasks:").trim())?;
        let mut changed = false;
        for task in &mut tasks {
            changed |= reset_recurrence(task);
            if should_notify(task, &settings) {
                let title = task["title"].as_str().unwrap_or("Task");
                app.notification()
                    .builder()
                    .title("StickUp reminder")
                    .body(title)
                    .show()?;
                task["notified"] = Value::Bool(true);
                task["last_notified"] = Value::String(Local::now().to_rfc3339());
                changed = true;
            }
        }
        if changed {
            let replacement = format!("tasks: {}", serde_json::to_string(&tasks)?);
            let updated = raw
                .lines()
                .map(|line| {
                    if line.starts_with("tasks:") {
                        replacement.as_str()
                    } else {
                        line
                    }
                })
                .collect::<Vec<_>>()
                .join("\n");
            fs::write(path, updated)?;
        }
    }
    Ok(())
}

fn read_settings(path: &PathBuf) -> Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| {
            serde_json::json!({
                "defaultNotificationMode": "gentle",
                "reminderLeadMinutes": 30,
                "nagIntervalMinutes": 15
            })
        })
}

fn reset_recurrence(task: &mut Value) -> bool {
    let recurrence = task["recurrence"].as_str().unwrap_or("none");
    let Some(due) = task["due"].as_str() else {
        return false;
    };
    if recurrence == "none" || due.is_empty() {
        return false;
    }
    let today = Local::now().date_naive();
    let due_date = due_date(due);
    if due_date >= today {
        return false;
    }
    if task["last_reset"]
        .as_str()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Local).date_naive() >= today)
        .unwrap_or(false)
    {
        return false;
    }

    let increment = if recurrence == "daily" { 1 } else { 7 };
    let mut next = due_date;
    while next < today {
        next += Duration::days(increment);
    }
    let date = format!("{:04}-{:02}-{:02}", next.year(), next.month(), next.day());
    task["due"] = if due.contains('T') {
        Value::String(format!("{}T{}", date, due.split_once('T').unwrap().1))
    } else {
        Value::String(date)
    };
    task["completed"] = Value::Bool(false);
    task["notified"] = Value::Bool(false);
    task["last_notified"] = Value::Null;
    task["last_reset"] = Value::String(Local::now().to_rfc3339());
    true
}

fn should_notify(task: &Value, settings: &Value) -> bool {
    if task["completed"].as_bool().unwrap_or(false) {
        return false;
    }
    let Some(due) = task["due"].as_str() else {
        return false;
    };
    let mode = task["notificationMode"]
        .as_str()
        .or_else(|| settings["defaultNotificationMode"].as_str());
    let Some(mode) = mode else { return false };
    if mode == "gentle" && task["notified"].as_bool().unwrap_or(false) {
        return false;
    }
    if mode == "nag" {
        if task["notified"].as_bool().unwrap_or(false) && due_date(due) < Local::now().date_naive()
        {
            return false;
        }
        let interval = settings["nagIntervalMinutes"].as_i64().unwrap_or(15);
        if let Some(last) = task["last_notified"]
            .as_str()
            .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        {
            if Local::now().signed_duration_since(last.with_timezone(&Local))
                < Duration::minutes(interval)
            {
                return false;
            }
        }
    }
    if let Some(time) = due.split_once('T').and_then(|(_, value)| value.get(..8)) {
        let date = NaiveDate::parse_from_str(&due[..10], "%Y-%m-%d").ok();
        let time = chrono::NaiveTime::parse_from_str(time, "%H:%M:%S").ok();
        let Some(target) = date
            .zip(time)
            .map(|(date, time)| NaiveDateTime::new(date, time))
        else {
            return false;
        };
        let target = Local.from_local_datetime(&target).single();
        let lead = settings["reminderLeadMinutes"].as_i64().unwrap_or(30);
        return target
            .map(|target| Local::now() >= target - Duration::minutes(lead))
            .unwrap_or(false);
    }
    due_date(due) <= Local::now().date_naive()
}

fn due_date(due: &str) -> NaiveDate {
    NaiveDate::parse_from_str(&due[..10], "%Y-%m-%d").unwrap_or_else(|_| Local::now().date_naive())
}
