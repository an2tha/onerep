//
//  OneRepBundle.swift
//  OneRep
//
//  Created on 16.07.26.
//

import WidgetKit
import SwiftUI

@main
struct OneRepBundle: WidgetBundle {
    var body: some Widget {
        OneRepQuickActionsWidget()
        OneRepNutritionWidget()
        OneRepScheduleWidget()
        OneRepCombinedWidget()
        OneRepLiveActivity()
    }
}
