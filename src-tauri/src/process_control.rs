//! Process-launch policy shared by the native runtime.
//!
//! Windows console applications can open a visible console when they are
//! launched by a GUI process. Keep that policy in one place so every native
//! subprocess follows the same no-window contract.

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn hide_std_command(command: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        command.creation_flags(CREATE_NO_WINDOW);
    }

    #[cfg(not(windows))]
    let _ = command;
}

pub fn hide_tokio_command(command: &mut tokio::process::Command) {
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    #[cfg(not(windows))]
    let _ = command;
}
