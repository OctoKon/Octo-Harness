pub mod ipc;
pub mod process;

use tauri::Manager;

pub fn run() {
    let application = tauri::Builder::default()
        .register_uri_scheme_protocol("splyce-module", |_context, _request| {
            tauri::http::Response::builder()
                .status(404)
                .body(Vec::<u8>::new())
                .expect("Fixed module response")
        })
        .setup(|app| {
            let directory = app.path().resource_dir()?.join("engine");
            app.manage(ipc::BridgeState::start(
                &directory,
                env!("SPLYCE_ENGINE_MANIFEST_SHA256"),
            )?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::handshake,
            ipc::send,
            ipc::cancel,
            ipc::subscribe,
            ipc::dialog_select_workspace
        ])
        .build(tauri::generate_context!())
        .expect("Unable to initialize desktop engine");
    application.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if app.state::<ipc::BridgeState>().stop().is_err() {
                api.prevent_exit();
            }
        }
    });
}
