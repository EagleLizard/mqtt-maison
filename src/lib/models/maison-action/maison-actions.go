package maisonaction

var ikea_action_map map[string]string

func init() {
	/*
		duplicate definition logic, also in maison-actions.ts
		TODO: consolidate if possible
		_*/
	ikea_action_map = map[string]string{
		"toggle":               "main",
		"volume_up":            "up",
		"volume_up_hold":       "up_hold",
		"volume_down":          "down",
		"volume_down_hold":     "down_hold",
		"track_next":           "next",
		"track_previous":       "prev",
		"dots_1_short_release": "dot",
		"dots_1_double_press":  "dot_double",
		"dots_1_long_release":  "dot_long",
		"dots_2_short_release": "dots",
		"dots_2_double_press":  "dots_double",
	}
}

func GetMappedIkeaAction(ikeaAction string) string {
	return ikea_action_map[ikeaAction]
}
