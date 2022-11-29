#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri::{
   Menu, MenuEntry, MenuItem, Submenu, AboutMetadata,  
};

fn main() {
  let ctx = tauri::generate_context!();
  let name = &ctx.package_info().name;
  tauri::Builder::default()
    .menu(Menu::with_items([
      #[cfg(target_os = "macos")]
      MenuEntry::Submenu(Submenu::new(
        "",
        Menu::with_items([
          MenuItem::About(name.into(), AboutMetadata::default()).into(),
          MenuItem::Quit.into()
        ]),
      )),

      MenuEntry::Submenu(Submenu::new(
        "Edit",
        Menu::with_items([
          MenuItem::Undo.into(),
          MenuItem::Redo.into(),
          MenuItem::Separator.into(),
          MenuItem::Cut.into(),
          MenuItem::Copy.into(),
          MenuItem::Paste.into(),
          #[cfg(not(target_os = "macos"))]
          MenuItem::Separator.into(),
          MenuItem::SelectAll.into(),
        ]),
      )),
    ]))
    .run(ctx)
    .expect("error while running tauri application");
}
